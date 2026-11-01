import { EventNode } from '@gravitydock/types';
import type { InputDefinition, OutputDefinition, PropertyDefinition, GravityDockAPI } from '@gravitydock/types';
import { QueryCategory } from '../categories';

declare const gravityDock: GravityDockAPI;

export class WatchTemplateNode extends EventNode {
    readonly typeId = 'query-watch-template';
    readonly displayName = 'Watch Template';
    readonly category = QueryCategory;
    readonly visible = true;

    readonly inputs: InputDefinition[] = [];

    readonly outputs: OutputDefinition[] = [
        { name: 'Record', outputType: 'core:typed-record' },
        { name: 'RecordId', outputType: 'core:string' },
        { name: 'Action', outputType: 'core:string' }
    ];

    readonly properties: PropertyDefinition[] = [
        { name: 'strictTemplate', label: 'Strict template', type: 'strict-template' as const, defaultValue: '' }
    ];

    private watchUnsubs: Map<string, () => void> = new Map();
    private emitFunctions: Map<string, (nodeId: string) => void> = new Map();
    private static latestEvents: Map<string, { record: any; recordId: string; action: string }> = new Map();

    register(nodeId: string, emit: (nodeId: string) => void): void {
        this.emitFunctions.set(nodeId, emit);
    }

    unregister(nodeId: string): void {
        const unsub = this.watchUnsubs.get(nodeId);
        if (unsub) {
            unsub();
            this.watchUnsubs.delete(nodeId);
        }
        this.emitFunctions.delete(nodeId);
        WatchTemplateNode.latestEvents.delete(nodeId);
    }

    async evaluate(inputs: Record<string, any>, properties: Record<string, any>): Promise<Record<string, any>> {
        const nodeId = properties['_nodeId'];
        if (properties['enabled'] === false || properties['_action'] === 'unregister') {
            if (nodeId) this.unregister(nodeId);
            return {};
        }
        const templateNameOrId = properties['strictTemplate'];

        if (nodeId && templateNameOrId && !this.watchUnsubs.has(nodeId)) {
            const unsub = gravityDock.query.watchTemplate(templateNameOrId, (event) => {
                WatchTemplateNode.latestEvents.set(nodeId, {
                    record: event.record || null,
                    recordId: event.recordId || '',
                    action: event.action || 'changed'
                });

                if (typeof gravityDock !== 'undefined' && gravityDock.emitEvent) {
                    gravityDock.emitEvent(nodeId);
                } else {
                    const targetEmit = this.emitFunctions.get(nodeId);
                    if (targetEmit) targetEmit(nodeId);
                }
            });
            this.watchUnsubs.set(nodeId, unsub);
        }

        const latest = nodeId ? WatchTemplateNode.latestEvents.get(nodeId) : null;
        return {
            Record: latest?.record || null,
            RecordId: latest?.recordId || '',
            Action: latest?.action || 'initial'
        };
    }
}
