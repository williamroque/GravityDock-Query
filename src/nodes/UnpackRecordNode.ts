import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

function inferFieldType(val: any, isVector: boolean): string {
    if (val && typeof val === 'object') {
        if ('unit' in val) return isVector ? 'core:quantity-array' : 'core:quantity';
        if ('currency' in val) return isVector ? 'core:currency-array' : 'core:currency';
        if ('lat' in val && 'lng' in val) return isVector ? 'core:location-array' : 'core:location';
        if ('path' in val) return isVector ? 'core:path-array' : 'core:path';
    }
    if (typeof val === 'number') return isVector ? 'core:number-array' : 'core:number';
    if (typeof val === 'boolean') return 'core:boolean';
    if (typeof val === 'string') return isVector ? 'core:string-array' : 'core:string';
    return isVector ? 'core:array' : 'core:any';
}

function extractRecordFields(item: any): Record<string, any> {
    if (!item || typeof item !== 'object') return {};
    if (item.fields && typeof item.fields === 'object') return item.fields;
    if (typeof item.fields_json === 'string') {
        try {
            return JSON.parse(item.fields_json || '{}');
        } catch {
            return {};
        }
    }
    if (!item.type_id && !item.fields_json) return item;
    return {};
}

export class UnpackRecordNode extends BaseNode {
    readonly typeId = 'query-unpack-record';
    readonly displayName = 'Unpack Record';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'Record', acceptsType: 'core:typed-record' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'id', outputType: 'core:string' },
        { name: 'title', outputType: 'core:string' },
        { name: 'created_at', outputType: 'core:number' },
        { name: 'updated_at', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'strictTemplate', label: 'Strict template (optional)', type: 'strict-template' as const, defaultValue: '' }
    ];

    getOutputs(data?: Record<string, unknown>, connections?: any[]): OutputDefinition[] {
        const isVector = Boolean(data?.isVectorized);
        const baseOutputs: OutputDefinition[] = [
            { name: 'id', outputType: isVector ? 'core:string-array' : 'core:string' },
            { name: 'title', outputType: isVector ? 'core:string-array' : 'core:string' },
            { name: 'created_at', outputType: isVector ? 'core:number-array' : 'core:number' },
            { name: 'updated_at', outputType: isVector ? 'core:number-array' : 'core:number' }
        ];

        const discoveredFields = (data?.fields as Record<string, any>) || {};
        const extraOutputs: OutputDefinition[] = [];

        for (const [key, val] of Object.entries(discoveredFields)) {
            if (key === 'id' || key === 'title' || key === 'created_at' || key === 'updated_at') continue;
            extraOutputs.push({
                name: key,
                outputType: inferFieldType(val, isVector)
            });
        }

        return [...baseOutputs, ...extraOutputs];
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const raw = inputs['Record'];
        if (!raw) return {};

        const templateNameOrId = properties['strictTemplate'] || raw.type_id || (Array.isArray(raw) ? raw[0]?.type_id : null);
        let schemaFields: Array<{ key: string; label?: string; kind?: string }> = [];

        if (templateNameOrId && typeof gravityDock !== 'undefined' && gravityDock.query?.getTemplate) {
            try {
                const template = await gravityDock.query.getTemplate(templateNameOrId);
                if (template && template.schema_json) {
                    const parsed = typeof template.schema_json === 'string' ? JSON.parse(template.schema_json) : template.schema_json;
                    if (Array.isArray(parsed)) {
                        schemaFields = parsed;
                    }
                }
            } catch {
            }
        }

        const schemaKeys = new Set<string>();
        for (const f of schemaFields) {
            if (f && f.key && f.kind !== 'header') {
                schemaKeys.add(f.key);
            }
        }

        if (Array.isArray(raw)) {
            const allKeys = new Set<string>(['id', 'title', 'created_at', 'updated_at', ...schemaKeys]);
            for (const item of raw) {
                const itemFields = extractRecordFields(item);
                for (const k of Object.keys(itemFields)) {
                    allKeys.add(k);
                }
            }

            const result: Record<string, any[]> = {};
            for (const k of allKeys) {
                result[k] = [];
            }

            for (const item of raw) {
                const itemFields = extractRecordFields(item);
                result['id'].push(item?.id ?? '');
                result['title'].push(item?.title ?? '');
                result['created_at'].push(item?.created_at ?? 0);
                result['updated_at'].push(item?.updated_at ?? 0);

                for (const k of allKeys) {
                    if (k === 'id' || k === 'title' || k === 'created_at' || k === 'updated_at') continue;
                    result[k].push(itemFields[k] ?? null);
                }
            }

            return result;
        }

        const fields = extractRecordFields(raw);
        const result: Record<string, any> = {
            id: raw?.id ?? '',
            title: raw?.title ?? '',
            created_at: raw?.created_at ?? 0,
            updated_at: raw?.updated_at ?? 0
        };

        for (const k of schemaKeys) {
            if (k === 'id' || k === 'title' || k === 'created_at' || k === 'updated_at') continue;
            result[k] = fields[k] ?? null;
        }

        for (const [k, v] of Object.entries(fields)) {
            if (k === 'id' || k === 'title' || k === 'created_at' || k === 'updated_at') continue;
            result[k] = v;
        }

        return result;
    }
}
