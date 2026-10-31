import { RenderNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition } from '@gravitydock/types';
import { QueryCategory } from '../categories';

export class RenderQueryNode extends RenderNode {
    readonly typeId = 'query-render';
    readonly displayName = 'Render Query';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [
        { name: 'Data', acceptsType: 'core:dataframe' }
    ];

    readonly outputs: OutputDefinition[] = [
        { name: 'Render', outputType: 'core:query-render' }
    ];

    readonly properties: PropertyDefinition[] = [
        {
            name: 'renderType',
            label: 'Render type',
            type: 'select' as const,
            options: [
                { value: 'table', label: 'Table' },
                { value: 'card', label: 'Cards' },
                { value: 'kanban', label: 'Kanban' },
                { value: 'timeline', label: 'Timeline' },
                { value: 'scalar', label: 'Scalar KPI' },
                { value: 'line_chart', label: 'Line Chart' },
                { value: 'bar_chart', label: 'Bar Chart' },
                { value: 'map', label: 'Map' },
                { value: 'list', label: 'List' }
            ],
            defaultValue: 'table'
        },
        { name: 'field', label: 'Group / date / map field', type: 'string' as const, defaultValue: '' },
        { name: 'label', label: 'Metric label', type: 'string' as const, defaultValue: '' },
        { name: 'chartXField', label: 'Chart X field', type: 'string' as const, defaultValue: '' },
        { name: 'chartYField', label: 'Chart Y field', type: 'string' as const, defaultValue: '' },
        { name: 'chartCategoryField', label: 'Category field', type: 'string' as const, defaultValue: '' },
        { name: 'chartValueField', label: 'Value field', type: 'string' as const, defaultValue: '' }
    ];

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        let rawData = inputs['Data'];
        if (rawData && typeof rawData === 'object') {
            if (rawData.type === 'core:dataframe' && rawData.content) rawData = rawData.content;
            if (rawData.Data) rawData = rawData.Data;
            else if (rawData.dataframe) rawData = rawData.dataframe;
            else if (rawData.table) rawData = rawData.table;
        }

        let columns: string[] = [];
        let rows: Record<string, any>[] = [];

        if (rawData) {
            if (Array.isArray(rawData)) {
                rows = rawData;
                columns = rows.length > 0 ? Object.keys(rows[0]) : [];
            } else if (rawData.columns && Array.isArray(rawData.rows)) {
                columns = rawData.columns;
                rows = rawData.rows;
            } else if (rawData.__arqueroData) {
                if (Array.isArray(rawData.__arqueroData)) {
                    rows = rawData.__arqueroData;
                    columns = rows.length > 0 ? Object.keys(rows[0]) : [];
                } else if (typeof rawData.__arqueroData === 'object') {
                    const colNames = Object.keys(rawData.__arqueroData);
                    columns = colNames;
                    const len = colNames.length > 0 && Array.isArray(rawData.__arqueroData[colNames[0]])
                        ? rawData.__arqueroData[colNames[0]].length
                        : 0;
                    rows = [];
                    for (let i = 0; i < len; i++) {
                        const row: Record<string, any> = {};
                        for (const c of colNames) {
                            row[c] = rawData.__arqueroData[c][i];
                        }
                        rows.push(row);
                    }
                }
            } else if (rawData._data && typeof rawData._data === 'object') {
                const colNames = Array.isArray(rawData._names) ? rawData._names : Object.keys(rawData._data);
                columns = colNames;
                const len = colNames.length > 0 && Array.isArray(rawData._data[colNames[0]])
                    ? rawData._data[colNames[0]].length
                    : 0;
                rows = [];
                for (let i = 0; i < len; i++) {
                    const row: Record<string, any> = {};
                    for (const c of colNames) {
                        row[c] = rawData._data[c][i];
                    }
                    rows.push(row);
                }
            } else if (typeof rawData.objects === 'function') {
                rows = rawData.objects();
                columns = typeof rawData.columnNames === 'function' ? rawData.columnNames() : Object.keys(rows[0] || {});
            }
        }

        const renderType = properties['renderType'] || 'table';
        const renderHint: Record<string, any> = {
            type: renderType
        };

        if (properties['field']) renderHint.field = properties['field'];
        if (properties['label']) renderHint.label = properties['label'];
        if (properties['chartXField']) renderHint.x = properties['chartXField'];
        if (properties['chartYField']) renderHint.y = [properties['chartYField']];
        if (properties['chartCategoryField']) renderHint.categories = properties['chartCategoryField'];
        if (properties['chartValueField']) renderHint.values = [properties['chartValueField']];

        return {
            type: 'core:query-render',
            content: {
                render: renderHint,
                data: {
                    columns,
                    rows
                }
            }
        };
    }
}
