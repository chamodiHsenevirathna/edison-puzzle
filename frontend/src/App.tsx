import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { Landing } from "./pages/Landing";
import { NotFound } from "./pages/NotFound";

const Playground = lazy(() => import("./pages/Playground").then((m) => ({ default: m.Playground })));
const Explorer = lazy(() => import("./pages/Explorer").then((m) => ({ default: m.Explorer })));
const Compare = lazy(() => import("./pages/Compare").then((m) => ({ default: m.Compare })));
const Gallery = lazy(() => import("./pages/Gallery").then((m) => ({ default: m.Gallery })));
const Challenges = lazy(() => import("./pages/Challenges").then((m) => ({ default: m.Challenges })));
const Creator = lazy(() => import("./pages/Creator").then((m) => ({ default: m.Creator })));
const ResultsPage = lazy(() => import("./pages/ResultsPage").then((m) => ({ default: m.ResultsPage })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));

export function App() {
  return (
    <Suspense fallback={<Loading what="Loading" />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="play/:puzzleId?" element={<Playground />} />
          <Route path="explore/:puzzleId?" element={<Explorer />} />
          <Route path="compare/:puzzleId?" element={<Compare />} />
          <Route path="solutions/:puzzleId?" element={<Gallery />} />
          <Route path="challenges" element={<Challenges />} />
          <Route path="create" element={<Creator />} />
          <Route path="results/:puzzleId?" element={<ResultsPage />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
