import { createContext, useContext, type ReactNode } from "react";
import { Bot, Wrench } from "lucide-react";
import type { AgentGraphNode } from "./agent-graph-layout";
import type { AgentGraphTool } from "./agent-hub-layout";

/** Identity comes from the host; the diagram never guesses a provider or model mark. */
export interface GraphMarks {
  renderAgentMark?: (agent: AgentGraphNode, layout: "tree" | "hub", size: number) => ReactNode;
  renderToolMark?: (tool: AgentGraphTool | undefined, label: string, size: number) => ReactNode;
}
const Marks = createContext<GraphMarks>({});
export const GraphMarksProvider = Marks.Provider;
export function AgentMark({ agent, layout, size }: { agent?: AgentGraphNode; layout: "tree" | "hub"; size: number }) {
  const { renderAgentMark } = useContext(Marks);
  return agent && renderAgentMark ? renderAgentMark(agent, layout, size) : <Bot size={layout === "tree" ? size : 16} aria-hidden />;
}
export function ToolMark({ tool, label, size }: { tool?: AgentGraphTool; label: string; size: number }) {
  const { renderToolMark } = useContext(Marks);
  return renderToolMark ? renderToolMark(tool, label, size) : <Wrench size={size * .4} aria-hidden />;
}
