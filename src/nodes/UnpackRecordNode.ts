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
        { name: 'id', label: 'ID', outputType: 'core:string' },
        { name: 'title', label: 'Title', outputType: 'core:string' },
        { name: 'created_at', label: 'Created At', outputType: 'core:number' },
        { name: 'updated_at', label: 'Updated At', outputType: 'core:number' }
    ];

    readonly properties: PropertyDefinition[] = [
        {
            name: 'selectColumns',
            label: 'Select columns',
            type: 'string' as const,
            defaultValue: '',
            description: 'Comma-separated list of columns to include (defaults to all when empty)'
        }
    ];

    getOutputs(data?: Record<string, unknown>, connections?: any[]): OutputDefinition[] {
        const isVector = Boolean(data?.isVectorized);
        const baseOutputs: OutputDefinition[] = [
            { name: 'id', label: 'ID', outputType: isVector ? 'core:string-array' : 'core:string' },
            { name: 'title', label: 'Title', outputType: isVector ? 'core:string-array' : 'core:string' },
            { name: 'created_at', label: 'Created At', outputType: isVector ? 'core:number-array' : 'core:number' },
            { name: 'updated_at', label: 'Updated At', outputType: isVector ? 'core:number-array' : 'core:number' }
        ];

        const discoveredFields = (data?.fields as Record<string, any>) || {};
        const extraOutputs: OutputDefinition[] = [];

        for (const [key, val] of Object.entries(discoveredFields)) {
            if (key === 'id' || key === 'title' || key === 'created_at' || key === 'updated_at') continue;
            extraOutputs.push({
                name: key,
                label: key,
                outputType: inferFieldType(val, isVector)
            });
        }

        const allOutputs = [...baseOutputs, ...extraOutputs];
        const selectColsRaw = (data?.selectColumns ?? data?.columns ?? '') as string;
        const selectedList = selectColsRaw
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);

        if (selectedList.length === 0) {
            return allOutputs;
        }

        const filteredOutputs: OutputDefinition[] = [];
        const seen = new Set<string>();
        for (const s of selectedList) {
            const sLower = s.toLowerCase();
            const matched = allOutputs.find(out =>
                out.name.toLowerCase() === sLower ||
                (out.label && out.label.toLowerCase() === sLower)
            );
            if (matched) {
                if (!seen.has(matched.name.toLowerCase())) {
                    seen.add(matched.name.toLowerCase());
                    filteredOutputs.push(matched);
                }
            }
        }

        return filteredOutputs;
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const raw = inputs['Record'];
        if (!raw) return {};

        const templateNameOrId = raw.type_id || (Array.isArray(raw) ? raw[0]?.type_id : null);
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

        const selectColsRaw = (properties['selectColumns'] || properties['columns'] || '') as string;
        const selectedCols = selectColsRaw.split(',').map(s => s.trim()).filter(Boolean);
        const isFiltering = selectedCols.length > 0;

        if (Array.isArray(raw)) {
            const allKeys = new Set<string>(['id', 'title', 'created_at', 'updated_at', ...schemaKeys]);
            for (const item of raw) {
                const itemFields = extractRecordFields(item);
                for (const k of Object.keys(itemFields)) {
                    allKeys.add(k);
                }
            }

            const keysToInclude: string[] = [];
            if (!isFiltering) {
                keysToInclude.push(...allKeys);
            } else {
                for (const s of selectedCols) {
                    const sLower = s.toLowerCase();
                    const matchedKey = Array.from(allKeys).find(k => {
                        const sf = schemaFields.find(f => f && f.key === k);
                        const label = sf?.label || (k === 'id' ? 'ID' : k === 'title' ? 'Title' : k === 'created_at' ? 'Created At' : k === 'updated_at' ? 'Updated At' : k);
                        return k.toLowerCase() === sLower || label.toLowerCase() === sLower;
                    });
                    if (matchedKey && !keysToInclude.includes(matchedKey)) {
                        keysToInclude.push(matchedKey);
                    }
                }
            }

            const result: Record<string, any[]> = {};
            for (const k of keysToInclude) {
                result[k] = [];
            }

            for (const item of raw) {
                const itemFields = extractRecordFields(item);
                if (result['id']) result['id'].push(item?.id ?? '');
                if (result['title']) result['title'].push(item?.title ?? '');
                if (result['created_at']) result['created_at'].push(item?.created_at ?? 0);
                if (result['updated_at']) result['updated_at'].push(item?.updated_at ?? 0);

                for (const k of keysToInclude) {
                    if (k === 'id' || k === 'title' || k === 'created_at' || k === 'updated_at') continue;
                    result[k].push(itemFields[k] ?? null);
                }
            }

            return result;
        }

        const fields = extractRecordFields(raw);
        const allKeys = new Set<string>(['id', 'title', 'created_at', 'updated_at', ...schemaKeys, ...Object.keys(fields)]);

        const keysToInclude: string[] = [];
        if (!isFiltering) {
            keysToInclude.push(...allKeys);
        } else {
            for (const s of selectedCols) {
                const sLower = s.toLowerCase();
                const matchedKey = Array.from(allKeys).find(k => {
                    const sf = schemaFields.find(f => f && f.key === k);
                    const label = sf?.label || (k === 'id' ? 'ID' : k === 'title' ? 'Title' : k === 'created_at' ? 'Created At' : k === 'updated_at' ? 'Updated At' : k);
                    return k.toLowerCase() === sLower || label.toLowerCase() === sLower;
                });
                if (matchedKey && !keysToInclude.includes(matchedKey)) {
                    keysToInclude.push(matchedKey);
                }
            }
        }

        const result: Record<string, any> = {};
        for (const k of keysToInclude) {
            if (k === 'id') result['id'] = raw?.id ?? '';
            else if (k === 'title') result['title'] = raw?.title ?? '';
            else if (k === 'created_at') result['created_at'] = raw?.created_at ?? 0;
            else if (k === 'updated_at') result['updated_at'] = raw?.updated_at ?? 0;
            else result[k] = fields[k] ?? null;
        }

        return result;
    }
}
