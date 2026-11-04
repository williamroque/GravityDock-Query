import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

function extractRowsFromDataframe(data: any): Record<string, any>[] | null {
    if (!data) return null;
    let current = data;

    for (let i = 0; i < 5; i++) {
        if (!current || typeof current !== 'object') break;
        if (typeof current.objects === 'function') {
            return current.objects();
        }
        if (Array.isArray(current.__arqueroData)) {
            return current.__arqueroData;
        }
        if (Array.isArray(current.rows)) {
            return current.rows;
        }
        if (Array.isArray(current)) {
            return current;
        }
        if (current.Data !== undefined) {
            current = current.Data;
            continue;
        }
        if (current.Dataframe !== undefined) {
            current = current.Dataframe;
            continue;
        }
        if (current.dataframe !== undefined) {
            current = current.dataframe;
            continue;
        }
        if (current.content !== undefined) {
            current = current.content;
            continue;
        }
        break;
    }

    if (Array.isArray(current)) return current;
    if (current && typeof current.objects === 'function') return current.objects();
    if (current && Array.isArray(current.rows)) return current.rows;
    if (current && Array.isArray(current.__arqueroData)) return current.__arqueroData;

    return null;
}

export class FromDataframeNode extends BaseNode {
    readonly typeId = 'query-from-dataframe';
    readonly displayName = 'From Dataframe';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'Data', label: 'Data', acceptsType: 'core:dataframe' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Records', label: 'Records', outputType: 'core:typed-record-array' },
        { name: 'Success', label: 'Success', outputType: 'core:boolean' }
    ];

    readonly properties: PropertyDefinition[] = [
        {
            name: 'strictTemplate',
            label: 'Strict template',
            type: 'strict-template' as const,
            defaultValue: '',
            description: 'Select the template schema to validate and build records against'
        }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const rawDf = inputs['Data'] ?? inputs['Dataframe'] ?? inputs['data'] ?? inputs['dataframe'];
        const templateNameOrId = properties['strictTemplate'] as string;

        if (!rawDf || !templateNameOrId) {
            return {
                Records: [],
                records: [],
                Success: false,
                success: false
            };
        }

        let template: { id: string; name: string; alias?: string; schema_json: string } | null = null;
        if (typeof gravityDock !== 'undefined' && gravityDock.query?.getTemplate) {
            try {
                template = await gravityDock.query.getTemplate(templateNameOrId);
            } catch {}
        }

        if (!template) {
            return {
                Records: [],
                records: [],
                Success: false,
                success: false
            };
        }

        let schema: Array<{ key: string; label?: string; kind?: string; required?: boolean; options?: any[] }> = [];
        try {
            const parsed = typeof template.schema_json === 'string' ? JSON.parse(template.schema_json) : template.schema_json;
            if (Array.isArray(parsed)) {
                schema = parsed;
            }
        } catch {}

        const nonHeaderFields = schema.filter(f => f && f.key && f.kind !== 'header');
        const rows = extractRowsFromDataframe(rawDf);

        if (!rows) {
            return {
                Records: [],
                records: [],
                Success: false,
                success: false
            };
        }

        if (rows.length === 0) {
            const columns = Array.isArray(rawDf?.columns) ? rawDf.columns : [];
            if (nonHeaderFields.length > 0 && columns.length > 0) {
                const hasMatchingCol = columns.some((col: string) => {
                    const cLower = String(col).toLowerCase();
                    return cLower === 'title' || nonHeaderFields.some(f => f.key.toLowerCase() === cLower || (f.label && f.label.toLowerCase() === cLower));
                });
                return {
                    Records: [],
                    records: [],
                    Success: hasMatchingCol,
                    success: hasMatchingCol
                };
            }
            return {
                Records: [],
                records: [],
                Success: true,
                success: true
            };
        }

        const sampleRow = rows[0];
        const rowKeys = Object.keys(sampleRow);
        const colMap = new Map<string, string>();

        for (const f of nonHeaderFields) {
            const keyLower = f.key.toLowerCase();
            const labelLower = f.label ? f.label.toLowerCase() : '';
            const matchedKey = rowKeys.find(rk => {
                const rkLower = rk.toLowerCase();
                return rkLower === keyLower || (labelLower && rkLower === labelLower);
            });
            if (matchedKey) {
                colMap.set(f.key, matchedKey);
            }
        }

        const titleCol = rowKeys.find(rk => {
            const rkLower = rk.toLowerCase();
            return rkLower === 'title' || rkLower === 'name';
        });

        const idCol = rowKeys.find(rk => rk.toLowerCase() === 'id');
        const createdAtCol = rowKeys.find(rk => rk.toLowerCase() === 'created_at' || rk.toLowerCase() === 'created at');
        const updatedAtCol = rowKeys.find(rk => rk.toLowerCase() === 'updated_at' || rk.toLowerCase() === 'updated at');

        if (nonHeaderFields.length > 0 && colMap.size === 0 && !titleCol) {
            return {
                Records: [],
                records: [],
                Success: false,
                success: false
            };
        }

        let fitsSchema = true;
        const records: any[] = [];

        for (const row of rows) {
            const recordFields: Record<string, any> = {};

            for (const f of nonHeaderFields) {
                const srcCol = colMap.get(f.key);
                const val = srcCol !== undefined ? row[srcCol] : (row[f.key] !== undefined ? row[f.key] : (f.label && row[f.label] !== undefined ? row[f.label] : undefined));

                if (f.required && (val === undefined || val === null || val === '')) {
                    fitsSchema = false;
                }

                if (val !== undefined && val !== null && val !== '') {
                    if (f.kind === 'integer' || f.kind === 'positive-integer' || f.kind === 'float' || f.kind === 'number') {
                        const num = Number(val);
                        if (isNaN(num)) {
                            fitsSchema = false;
                        } else if (f.kind === 'positive-integer' && (num < 0 || !Number.isInteger(num))) {
                            fitsSchema = false;
                        }
                    } else if (f.kind === 'boolean') {
                        if (typeof val !== 'boolean' && val !== 'true' && val !== 'false' && val !== 0 && val !== 1) {
                            fitsSchema = false;
                        }
                    } else if (f.kind === 'select' && Array.isArray(f.options) && f.options.length > 0) {
                        const optionMatch = f.options.some((opt: any) => {
                            if (typeof opt === 'object' && opt !== null) {
                                return opt.value === val || opt.label === val;
                            }
                            return opt === val;
                        });
                        if (!optionMatch) {
                            fitsSchema = false;
                        }
                    }
                    recordFields[f.key] = val;
                } else if (val !== undefined) {
                    recordFields[f.key] = val;
                }
            }

            const rawId = idCol ? row[idCol] : (row.id || row.ID);
            const id = rawId ? String(rawId) : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)));
            const rawTitle = titleCol ? row[titleCol] : (row.title || row.Title);
            const title = rawTitle !== undefined && rawTitle !== null && String(rawTitle).trim() !== '' ? String(rawTitle) : 'Untitled';
            const rawCreatedAt = createdAtCol ? row[createdAtCol] : (row.created_at || row.createdAt);
            const createdAt = typeof rawCreatedAt === 'number' ? rawCreatedAt : (!isNaN(Number(rawCreatedAt)) && rawCreatedAt ? Number(rawCreatedAt) : Date.now());
            const rawUpdatedAt = updatedAtCol ? row[updatedAtCol] : (row.updated_at || row.updatedAt);
            const updatedAt = typeof rawUpdatedAt === 'number' ? rawUpdatedAt : (!isNaN(Number(rawUpdatedAt)) && rawUpdatedAt ? Number(rawUpdatedAt) : Date.now());

            records.push({
                id,
                title,
                type_id: template.id,
                fields: recordFields,
                created_at: createdAt,
                updated_at: updatedAt
            });
        }

        return {
            Records: records,
            records,
            Success: fitsSchema,
            success: fitsSchema
        };
    }
}
