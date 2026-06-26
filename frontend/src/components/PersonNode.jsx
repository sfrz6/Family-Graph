/**
 * PersonNode.jsx - Custom node for each family member in the graph.
 * 
 * React Flow lets you define custom nodes. Instead of plain boxes,
 * each person gets a styled card with their name and a color based
 * on their gender.
 * 
 * React Flow passes "data" to each node, which contains whatever
 * we put there when creating the node (name, gender, etc.)
 * 
 * Handle = the connection point on a node where edges attach.
 * Position.Top = edges come in from above (from parents)
 * Position.Bottom = edges go out below (to children)
 */

import { Handle, Position } from "@xyflow/react";

function PersonNode({ data, selected }) {
  const isMale = data.gender === "male";

  return (
    <div
      className={`person-node ${isMale ? "male" : "female"} ${
        selected ? "selected" : ""
      } ${data.highlighted ? "highlighted" : ""} ${data.is_deceased ? "deceased" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="node-handle" />

      <div className="node-content">
        {data.name_en && <div className="node-name-en">{data.name_en}</div>}
        <div className="node-name-ar">{data.name_ar}</div>
        {data.is_deceased && <div className="node-deceased-label">✦</div>}
      </div>

      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

export default PersonNode;
