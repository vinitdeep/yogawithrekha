import type { ConfigProblem } from '../lib/config';

/**
 * Shown instead of the site when a PRODUCTION build is missing required configuration.
 * The site deliberately does not start (and never falls back to demo sign-in) in this state.
 */
export function ConfigError({ problems }: { problems: ConfigProblem[] }) {
  return (
    <main className="boot boot-error" role="alert">
      <h1>This site isn’t configured yet</h1>
      <p>The production build can’t start safely because some settings are missing or invalid. No sign-in or payments are available until this is fixed.</p>
      <ul className="config-problems">
        {problems.map((p) => <li key={p.variable}><code>{p.variable}</code> — {p.message}</li>)}
      </ul>
      <p className="small">Site owners: see <code>SETUP-PRODUCTION.md</code> and <code>.env.example</code> in the project.</p>
    </main>
  );
}
