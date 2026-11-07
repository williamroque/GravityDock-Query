import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

export class GetByIdNode extends BaseNode {
    readonly typeId = 'query-get-by-id';
    readonly displayName = 'Get by ID';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'ID', label: 'ID', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Record', label: 'Record', outputType: 'core:typed-record' },
        { name: 'Found', label: 'Found', outputType: 'core:boolean' }
    ];

    readonly properties: PropertyDefinition[] = [
        {
            name: 'id',
            label: 'Record ID',
            type: 'string' as const,
            defaultValue: '',
            description: 'ID of the record to fetch (overridden by ID input)'
        },
        {
            name: 'strictTemplate',
            label: 'Strict template',
            type: 'strict-template' as const,
            defaultValue: '',
            description: 'Optional template filter and schema hint'
        }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const idInput = inputs['ID'] ?? inputs['id'] ?? inputs['RecordId'] ?? inputs['recordId'] ?? properties['id'] ?? properties['recordId'];
        const templateFilter = (properties['strictTemplate'] ?? properties['template'] ?? '') as string;

        let template: { id: string; name: string; alias?: string; schema_json: string } | null = null;
        if (templateFilter && typeof gravityDock !== 'undefined' && gravityDock.query?.getTemplate) {
            try {
                template = await gravityDock.query.getTemplate(templateFilter);
            } catch {}
        }

        const fetchRecord = async (rawId: any) => {
            if (!rawId) return null;
            const targetId = String(rawId).trim();
            if (!targetId) return null;

            let record: any = null;
            if (typeof gravityDock !== 'undefined') {
                if (gravityDock.query?.getRecord) {
                    record = await gravityDock.query.getRecord(targetId);
                } else if (gravityDock.query?.getRecordById) {
                    record = await gravityDock.query.getRecordById(targetId);
                }
            }

            if (!record) return null;

            if (templateFilter) {
                const typeId = String(record.type_id || '').toLowerCase();
                const matches = (
                    typeId === templateFilter.toLowerCase() ||
                    (template && (
                        typeId === template.id.toLowerCase() ||
                        (template.alias && typeId === template.alias.toLowerCase()) ||
                        (template.name && typeId === template.name.toLowerCase())
                    ))
                );
                if (!matches) {
                    return null;
                }
            }

            return record;
        };

        if (Array.isArray(idInput)) {
            const records = await Promise.all(idInput.map(fetchRecord));
            const found = records.map(r => r !== null);
            return {
                Record: records,
                record: records,
                Found: found,
                found: found
            };
        }

        const record = await fetchRecord(idInput);
        const isFound = record !== null;
        return {
            Record: record,
            record: record,
            Found: isFound,
            found: isFound
        };
    }
}
