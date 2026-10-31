import { RunQueryNode } from './nodes/RunQueryNode';
import { WatchTemplateNode } from './nodes/WatchTemplateNode';
import { RenderQueryNode } from './nodes/RenderQueryNode';
import { UnpackRecordNode } from './nodes/UnpackRecordNode';
import type { GravityDockAPI } from '@gravitydock/types';

declare const gravityDock: GravityDockAPI;

const nodes = [
    new RunQueryNode(),
    new WatchTemplateNode(),
    new RenderQueryNode(),
    new UnpackRecordNode()
];

const serializableNodes = nodes.map(n => ({
    typeId: n.typeId,
    displayName: n.displayName,
    category: n.category,
    nodeInterface: n.nodeInterface,
    visible: n.visible,
    inputs: n.inputs,
    outputs: n.outputs,
    properties: n.properties,
    dynamicInputs: n.dynamicInputs,
    dynamicOutputs: n.dynamicOutputs
}));

gravityDock.registerNodes(serializableNodes);

gravityDock.onEvaluateNode(async ({ typeId, inputs, properties }: any) => {
    const node = nodes.find(n => n.typeId === typeId);
    if (!node) {
        throw new Error(`Unknown node type: ${typeId}`);
    }
    return await node.evaluate(inputs, properties);
});
