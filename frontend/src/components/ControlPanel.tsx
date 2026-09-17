import { useWorkspaceStore } from "../store/workspaceStore";

const features = [
  "Multiplayer Mode",
  "Real-time Gameplay",
  "Leaderboards",
  "In-game Chat",
  "User Profiles",
  "Tournaments",
  "Spectator Mode",
  "Cross-platform",
];

const categories = [
  "Project Basics",
  "User Behavior & Connectivity",
  "Data & Storage",
  "Performance & Scalability",
  "Security & Access Control",
  "Deployment & DevOps",
  "Observability & Reliability",
  "Cost & Business Model",
];

interface Props {
  onArchitecture: () => void;
  onDiagram: () => void;
  onMCQ: () => void;
  onAddNote: () => void;
}

export function ControlPanel({ onArchitecture, onDiagram, onMCQ, onAddNote }: Props) {
  const project = useWorkspaceStore((state) => state.project);
  const updateProject = useWorkspaceStore((state) => state.updateProject);
  const toggleFeature = useWorkspaceStore((state) => state.toggleFeature);

  return (
    <aside className="controls-section">
      <section className="control-group">
        <h2>◈ Application Details</h2>
        <label htmlFor="appType">Application Type</label>
        <select
          id="appType"
          value={project.appType}
          onChange={(event) => updateProject({ appType: event.target.value })}
        >
          <option>Web Application</option>
          <option>Mobile App</option>
          <option>Desktop Software</option>
          <option>Hybrid App (PWA)</option>
        </select>
        <label htmlFor="userCount">Expected User Scale</label>
        <select
          id="userCount"
          value={project.userCount}
          onChange={(event) => updateProject({ userCount: event.target.value })}
        >
          <option>&lt;100 users</option>
          <option>100–1,000 users</option>
          <option>1,000–10,000 users</option>
          <option>10,000–100,000 users</option>
          <option>100,000+ users</option>
        </select>
      </section>

      <section className="control-group">
        <h2>★ Core Features</h2>
        <div className="features-grid">
          {features.map((feature) => (
            <label className="feature-item" key={feature}>
              <input
                type="checkbox"
                checked={project.features.includes(feature)}
                onChange={() => toggleFeature(feature)}
              />
              <span>{feature}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="control-group">
        <h2>▤ Project Description</h2>
        <textarea
          value={project.prompt}
          onChange={(event) => updateProject({ prompt: event.target.value })}
        />
      </section>

      <section className="control-group compact-group">
        <h2>? Generate MCQ</h2>
        <select
          value={project.category}
          onChange={(event) => updateProject({ category: event.target.value })}
        >
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <button onClick={onMCQ}>Generate MCQ</button>
      </section>

      <div className="primary-actions">
        <button onClick={onArchitecture}>Generate Architecture</button>
        <button onClick={onDiagram}>Generate Diagram</button>
        <button className="secondary-button" onClick={onAddNote}>＋ Add Sticky Note</button>
      </div>
    </aside>
  );
}
