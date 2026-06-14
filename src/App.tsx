/**
 * Application shell. This is intentionally a thin placeholder for the scaffold.
 *
 * The real UI is built per the Linear issues (input sections §3, results panel §6,
 * schedule table §6A, tornado). All numbers MUST flow from the single pure
 * `compute(inputs)` in `src/engine/compute.ts` — never a second calculation path.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">
          20-Year Investment Value Calculator
        </h1>
        <p className="text-sm text-slate-500">
          Real Estate vs same-cash Equity benchmark · opportunity-cost (XIRR) framing
        </p>
      </header>
      <main className="p-6">
        <p className="text-slate-600">
          Scaffold ready. Engine and UI are implemented per the Linear issues
          (see <code>docs/Investment_Calculator_PRD_v3.md</code>). Run{" "}
          <code>npm test</code> for the formula test suite.
        </p>
      </main>
    </div>
  );
}
