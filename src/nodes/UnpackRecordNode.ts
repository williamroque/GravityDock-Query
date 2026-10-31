import { BaseNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { QueryCategory } from '../categories';

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

    readonly properties: PropertyDefinition[] = [];

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

        if (Array.isArray(raw)) {
            const result: Record<string, any[]> = {
                id: [],
                title: [],
                created_at: [],
                updated_at: []
            };

            for (const item of raw) {
                const itemFields = item?.fields || item || {};
                result.id.push(item?.id ?? '');
                result.title.push(item?.title ?? '');
                result.created_at.push(item?.created_at ?? 0);
                result.updated_at.push(item?.updated_at ?? 0);

                for (const [k, v] of Object.entries(itemFields)) {
                    if (k === 'id' || k === 'title' || k === 'created_at' || k === 'updated_at') continue;
                    if (!result[k]) result[k] = [];
                    result[k].push(v);
                }
            }

            return result;
        }

        const fields = raw.fields || raw || {};
        const result: Record<string, any> = {
            id: raw.id ?? '',
            title: raw.title ?? '',
            created_at: raw.created_at ?? 0,
            updated_at: raw.updated_at ?? 0
        };

        for (const [k, v] of Object.entries(fields)) {
            if (k === 'id' || k === 'title' || k === 'created_at' || k === 'updated_at') continue;
            result[k] = v;
        }

        return result;
    }
}
