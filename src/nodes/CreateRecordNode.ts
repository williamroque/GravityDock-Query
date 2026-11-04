import { ExecuteNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

function extractSingleRecord(input: any): any {
    if (!input || typeof input !== 'object') return null;
    if (input.Record && typeof input.Record === 'object' && !Array.isArray(input.Record)) return input.Record;
    if (input.record && typeof input.record === 'object' && !Array.isArray(input.record)) return input.record;
    return input;
}

export class CreateRecordNode extends ExecuteNode {
    readonly nodeInterface = 'execute' as const;
    readonly typeId = 'query-create-record';
    readonly displayName = 'Create Record';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'Record', label: 'Record', acceptsType: 'core:typed-record' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Record', label: 'Record', outputType: 'core:typed-record' },
        { name: 'ID', label: 'ID', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'strictTemplate', label: 'Strict template', type: 'strict-template' as const, defaultValue: '' },
        { name: 'projectId', label: 'Project', type: 'project' as const, defaultValue: '', placeholder: 'Global (No Project)' }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const templateNameOrId = (properties['strictTemplate'] ?? properties['template']) as string;
        if (!templateNameOrId) {
            throw new Error('Create Record requires a template to be selected in properties.');
        }

        let template: { id: string; name: string; alias?: string; schema_json: string; project_id?: string | null } | null = null;
        if (typeof gravityDock !== 'undefined' && gravityDock.query?.getTemplate) {
            try {
                template = await gravityDock.query.getTemplate(templateNameOrId);
            } catch {}
        }

        if (!template) {
            throw new Error('Template \'' + templateNameOrId + '\' not found.');
        }

        const rawProjectId = properties['projectId'] ?? properties['project'];
        const projectId = (rawProjectId && rawProjectId !== '__all__') ? rawProjectId : null;

        if (template.project_id !== null && template.project_id !== undefined && !projectId) {
            throw new Error('Template \'' + (template.name || template.id) + '\' belongs to a project and cannot be used in Global.');
        }

        const recordInput = inputs['Record'] ?? inputs['record'];
        if (!recordInput) {
            throw new Error('No record input provided to Create Record.');
        }

        const validateAndCreate = async (rec: any): Promise<any> => {
            const record = extractSingleRecord(rec);
            if (!record || typeof record !== 'object') {
                throw new Error('Invalid record object provided.');
            }

            if (record.type_id) {
                const recTypeId = String(record.type_id).toLowerCase();
                const tmplId = template.id.toLowerCase();
                const tmplName = (template.name || '').toLowerCase();
                const tmplAlias = (template.alias || '').toLowerCase();

                if (recTypeId !== tmplId && recTypeId !== tmplName && recTypeId !== tmplAlias) {
                    throw new Error('Record type \'' + record.type_id + '\' does not match selected template \'' + (template.name || template.id) + '\'.');
                }
            }

            let schema: any[] = [];
            try {
                const parsed = typeof template.schema_json === 'string' ? JSON.parse(template.schema_json) : template.schema_json;
                if (Array.isArray(parsed)) schema = parsed;
            } catch {}

            const fields = record.fields || (typeof record === 'object' && !record.type_id ? record : {});
            for (const f of schema) {
                if (f && f.key && f.kind !== 'header' && f.required) {
                    const val = fields[f.key] ?? record[f.key];
                    if (val === undefined || val === null || val === '') {
                        throw new Error('Record is missing required field \'' + (f.label || f.key) + '\'.');
                    }
                }
            }

            if (typeof gravityDock !== 'undefined' && gravityDock.query?.createRecord) {
                return await gravityDock.query.createRecord(template.id, projectId, record);
            }

            if (typeof window !== 'undefined' && (window as any).api?.strictNotes?.createNote) {
                const title = record.title || 'Untitled';
                const createdId = await (window as any).api.strictNotes.createNote(
                    template.id,
                    title,
                    projectId,
                    JSON.stringify(fields),
                    record.id
                );
                return {
                    id: createdId,
                    title,
                    type_id: template.id,
                    fields,
                    project_id: projectId
                };
            }

            return {
                id: record.id || 'mock-id',
                title: record.title || 'Untitled',
                type_id: template.id,
                fields,
                project_id: projectId
            };
        };

        if (Array.isArray(recordInput)) {
            const createdList: any[] = [];
            for (const item of recordInput) {
                const created = await validateAndCreate(item);
                createdList.push(created);
            }
            return {
                Record: createdList,
                record: createdList,
                ID: createdList.map(r => r.id),
                id: createdList.map(r => r.id)
            };
        }

        const created = await validateAndCreate(recordInput);
        return {
            Record: created,
            record: created,
            ID: created.id,
            id: created.id
        };
    }
}
