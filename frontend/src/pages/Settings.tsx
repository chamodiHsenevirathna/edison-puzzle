import { useState } from "react";
import { Notice, Panel } from "../components/ui";
import { useDocumentTitle } from "../lib/hooks";
import { usePrefs } from "../lib/prefs";
import { clearAllLocalData } from "../lib/storage";
import { clearRecordingCache } from "../explorer/useRecording";

export function Settings() {
  useDocumentTitle("Preferences");
  const { prefs, update } = usePrefs();
  const [cleared, setCleared] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div>
      <div className="page-head">
        <div>
          <span className="eyebrow">Preferences</span>
          <h1>Display and data</h1>
        </div>
      </div>
      <div className="stack" style={{ maxWidth: 720 }}>
        <Panel title="Board display">
          <div className="stack">
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.showFreeHatch}
                onChange={(e) => update({ showFreeHatch: e.target.checked })}
              />{" "}
              Hatch the free (uncovered) area
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.showLabels}
                onChange={(e) => update({ showLabels: e.target.checked })}
              />{" "}
              Show piece labels
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={prefs.showDimensions}
                onChange={(e) => update({ showDimensions: e.target.checked })}
              />{" "}
              Show dimension lines on the selected piece
            </label>
          </div>
        </Panel>
        <Panel title="Motion">
          <label htmlFor="motion">Reduce motion</label>
          <select
            id="motion"
            value={prefs.reduceMotion}
            onChange={(e) => update({ reduceMotion: e.target.value as "system" | "on" | "off" })}
          >
            <option value="system">Follow my system setting</option>
            <option value="on">Always reduce</option>
            <option value="off">Never reduce</option>
          </select>
        </Panel>
        <Panel title="What is stored where">
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>In this browser:</strong> these preferences, your game in progress, your completed runs,
              and a cache of challenge progress.
            </li>
            <li>
              <strong>On the server:</strong> custom puzzles you save, solutions the solver finds for them,
              and verified completions (tagged with a random id from this browser, never a name or account).
            </li>
          </ul>
        </Panel>
        <Panel title="Reset">
          <div className="stack">
            <p style={{ margin: 0 }}>
              Remove everything this app stored in <em>this browser</em>. Server-side puzzles are not deleted;
              delete those in the Creator.
            </p>
            {confirm ? (
              <div className="btn-group">
                <button
                  className="btn danger"
                  onClick={() => {
                    clearAllLocalData();
                    clearRecordingCache();
                    setCleared(true);
                    setConfirm(false);
                  }}
                >
                  Yes, clear local data
                </button>
                <button className="btn ghost" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <button className="btn danger" onClick={() => setConfirm(true)}>
                  Clear local data…
                </button>
              </div>
            )}
            {cleared && (
              <Notice kind="success" role="status">
                Local data cleared. Reload to start with a new anonymous id.
              </Notice>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
