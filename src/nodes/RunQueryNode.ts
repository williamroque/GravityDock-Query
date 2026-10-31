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
        const allFieldKeys = new Set<string>(['id', 'title']);

        try {
            const template = await gravityDock.query.getTemplate(templateNameOrId);
            if (template && template.schema_json) {
                const schema = typeof template.schema_json === 'string' ? JSON.parse(template.schema_json) : template.schema_json;
                if (Array.isArray(schema)) {
                    for (const field of schema) {
                        if (field && field.key) {
                            allFieldKeys.add(field.key);
                        }
                    }
                }
            }
        } catch {
        }

        allFieldKeys.add('created_at');
        allFieldKeys.add('updated_at');

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
                allFieldKeys.add(k);
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

        const columns = Array.from(allFieldKeys);
        const normalizedRows: Record<string, any>[] = [];
        for (const row of rows) {
            const norm: Record<string, any> = {};
            for (const col of columns) {
                norm[col] = row[col] !== undefined ? row[col] : null;
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
