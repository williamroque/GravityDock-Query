import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

function mapKindToIOType(kind?: string): string {
    switch (kind) {
        case 'positive-integer':
        case 'integer':
        case 'float':
        case 'computed':
            return 'core:number';
        case 'currency':
            return 'core:currency';
        case 'float-unit':
            return 'core:quantity';
        case 'location':
            return 'core:location';
        case 'file-path':
        case 'directory-path':
            return 'core:path';
        case 'boolean':
            return 'core:boolean';
        case 'select-multiple':
        case 'multi-strict-note':
            return 'core:string-array';
        case 'text':
        case 'textbox':
        case 'rich-textbox':
        case 'select':
        case 'strict-note':
        case 'free-note':
        case 'date':
        case 'time':
        case 'email':
        case 'phone':
        case 'whatsapp':
        case 'color':
        case 'file':
        case 'image':
        case 'external-link':
        case 'changelog':
            return 'core:string';
        default:
            return 'core:any';
    }
}

export class BuildRecordNode extends BaseNode {
    readonly typeId = 'query-build-record';
    readonly displayName = 'Build Record';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'title', label: 'Title', acceptsType: 'core:string' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Record', label: 'Record', outputType: 'core:typed-record' }
    ];

    readonly properties: PropertyDefinition[] = [
        {
            name: 'strictTemplate',
            label: 'Strict template',
            type: 'strict-template' as const,
            defaultValue: ''
        },
        {
            name: 'selectColumns',
            label: 'Select columns',
            type: 'string' as const,
            defaultValue: '',
            description: 'Comma-separated list of columns to include (defaults to all when empty)'
        }
    ];

    getInputs(data?: Record<string, unknown>, connections?: any[]): InputDefinition[] {
        const baseInputs: InputDefinition[] = [
            { name: 'title', label: 'Title', acceptsType: 'core:string' }
        ];

        const schemaFields = (data?._schemaFields as Array<{ key: string; label?: string; kind?: string }>) || [];
        const extraInputs: InputDefinition[] = [];

        for (const field of schemaFields) {
            if (!field || !field.key || field.kind === 'header') continue;
            if (field.key === 'title') {
                if (field.label) baseInputs[0].label = field.label;
                continue;
            }
            if (field.key === 'id' || field.key === 'created_at' || field.key === 'updated_at') continue;

            extraInputs.push({
                name: field.key,
                label: field.label || field.key,
                acceptsType: mapKindToIOType(field.kind)
            });
        }

        const systemInputs: InputDefinition[] = [
            { name: 'id', label: 'ID', acceptsType: 'core:string' },
            { name: 'created_at', label: 'Created At', acceptsType: 'core:number' },
            { name: 'updated_at', label: 'Updated At', acceptsType: 'core:number' }
        ];

        const allInputs = [...baseInputs, ...extraInputs];
        const selectColsRaw = (data?.selectColumns ?? data?.columns ?? '') as string;
        const selectedList = selectColsRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        if (selectedList.length === 0) {
            return allInputs;
        }

        const candidateInputs = [...allInputs, ...systemInputs];
        const filteredInputs: InputDefinition[] = [];
        const seen = new Set<string>();

        for (const s of selectedList) {
            const sLower = s.toLowerCase();
            const matched = candidateInputs.find(inp =>
                inp.name.toLowerCase() === sLower ||
                (inp.label && inp.label.toLowerCase() === sLower)
            );
            if (matched && !seen.has(matched.name.toLowerCase())) {
                seen.add(matched.name.toLowerCase());
                filteredInputs.push(matched);
            }
        }

        return filteredInputs;
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const templateNameOrId = (properties['strictTemplate'] as string) || '';
        let resolvedTypeId = templateNameOrId;

        if (templateNameOrId && typeof gravityDock !== 'undefined' && gravityDock.query?.getTemplate) {
            try {
                const tmpl = await gravityDock.query.getTemplate(templateNameOrId);
                if (tmpl?.id) {
                    resolvedTypeId = tmpl.id;
                }
            } catch {}
        }

        const id = inputs['id'] || inputs['ID'] || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)));
        const title = inputs['title'] || inputs['Title'] || 'Untitled';
        const createdAt = Number(inputs['created_at'] || inputs['Created At'] || Date.now());
        const updatedAt = Number(inputs['updated_at'] || inputs['Updated At'] || Date.now());

        const fields: Record<string, any> = {};
        for (const [key, val] of Object.entries(inputs)) {
            if (
                key === 'id' || key === 'ID' ||
                key === 'title' || key === 'Title' ||
                key === 'created_at' || key === 'Created At' ||
                key === 'updated_at' || key === 'Updated At' ||
                key === 'Event' || key === '_vectorIndex' ||
                key === '_vectorLength' || key === '_vectorInputs'
            ) {
                continue;
            }
            fields[key] = val;
        }

        const record = {
            id,
            title,
            type_id: resolvedTypeId,
            fields,
            created_at: createdAt,
            updated_at: updatedAt
        };

        return {
            Record: record,
            record
        };
    }
}
