import { ExecuteNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

export class RunQueryNode extends ExecuteNode {
    readonly nodeInterface = 'execute' as const;
    readonly typeId = 'query-run';
    readonly displayName = 'Run Query';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [];

    readonly outputs: OutputDefinition[] = [
        { name: 'Data', outputType: 'core:dataframe' },
        { name: 'Records', outputType: 'core:typed-record-array' },
        { name: 'Count', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'strictTemplate', label: 'Strict template', type: 'strict-template' as const, defaultValue: '' },
        { name: 'projectId', label: 'Project', type: 'project' as const, defaultValue: '' }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const templateNameOrId = properties['strictTemplate'];
        if (!templateNameOrId) {
            return {
                Data: { columns: [], rows: [], __arqueroData: [] },
                Records: [],
                Count: 0
            };
        }

        const rawProjectId = properties['projectId'];
        const projectId = (rawProjectId && rawProjectId !== '__all__') ? rawProjectId : null;
        const records = await gravityDock.query.getRecords(templateNameOrId, projectId);

        const rows: Record<string, any>[] = [];
        const typedRecords: any[] = [];
        const keyToLabel = new Map<string, string>();
        const orderedKeys: string[] = ['id', 'title'];

        keyToLabel.set('id', 'ID');
        keyToLabel.set('title', 'Title');

        try {
            const template = await gravityDock.query.getTemplate(templateNameOrId);
            if (template && template.schema_json) {
                const schema = typeof template.schema_json === 'string' ? JSON.parse(template.schema_json) : template.schema_json;
                if (Array.isArray(schema)) {
                    for (const field of schema) {
                        if (!field || !field.key || field.kind === 'header') continue;
                        const label = field.label || field.key;
                        if (field.key === 'id') {
                            keyToLabel.set('id', label);
                        } else if (field.key === 'title') {
                            keyToLabel.set('title', label);
                        } else if (field.key === 'created_at') {
                            keyToLabel.set('created_at', label);
                        } else if (field.key === 'updated_at') {
                            keyToLabel.set('updated_at', label);
                        } else {
                            keyToLabel.set(field.key, label);
                            if (!orderedKeys.includes(field.key)) {
                                orderedKeys.push(field.key);
                            }
                        }
                    }
                }
            }
        } catch {
        }

        if (!keyToLabel.has('created_at')) {
            keyToLabel.set('created_at', 'Created At');
        }
        if (!orderedKeys.includes('created_at')) {
            orderedKeys.push('created_at');
        }

        if (!keyToLabel.has('updated_at')) {
            keyToLabel.set('updated_at', 'Updated At');
        }
        if (!orderedKeys.includes('updated_at')) {
            orderedKeys.push('updated_at');
        }

        for (const r of records) {
            let parsedFields: Record<string, any> = {};
            if (typeof r.fields_json === 'string') {
                try {
                    parsedFields = JSON.parse(r.fields_json || '{}');
                } catch {
                    parsedFields = {};
                }
            } else if (r.fields && typeof r.fields === 'object') {
                parsedFields = r.fields;
            }

            for (const k of Object.keys(parsedFields)) {
                if (!keyToLabel.has(k)) {
                    keyToLabel.set(k, k);
                    orderedKeys.push(k);
                }
            }

            const row: Record<string, any> = {
                id: r.id,
                title: r.title,
                ...parsedFields,
                created_at: r.created_at,
                updated_at: r.updated_at
            };
            rows.push(row);

            typedRecords.push({
                id: r.id,
                title: r.title,
                type_id: r.type_id,
                fields: parsedFields,
                created_at: r.created_at,
                updated_at: r.updated_at,
                project_id: r.project_id
            });
        }

        const columns: string[] = [];
        const usedLabels = new Set<string>();
        const keyToColumnName = new Map<string, string>();

        for (const key of orderedKeys) {
            const rawLabel = keyToLabel.get(key) || key;
            let colName = rawLabel;
            let counter = 2;
            while (usedLabels.has(colName)) {
                colName = `${rawLabel} (${counter++})`;
            }
            usedLabels.add(colName);
            columns.push(colName);
            keyToColumnName.set(key, colName);
        }

        const normalizedRows: Record<string, any>[] = [];
        for (const row of rows) {
            const norm: Record<string, any> = {};
            for (const key of orderedKeys) {
                const colName = keyToColumnName.get(key)!;
                norm[colName] = row[key] !== undefined ? row[key] : null;
            }
            normalizedRows.push(norm);
        }

        const dataframe = {
            columns,
            rows: normalizedRows,
            __arqueroData: normalizedRows
        };

        return {
            Data: dataframe,
            Records: typedRecords,
            Count: normalizedRows.length
        };
    }
}
