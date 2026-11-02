import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './lib/ipc';
import { useBootstrap } from './hooks/useBootstrap';
import { MainShell } from './components/layout/MainShell';
import { CopilotWindow } from './components/overlay/CopilotWindow';

export function App() {
  useBootstrap();

  if (!isTauri) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center muted">
        Velora runs as a desktop app. Start it with <code className="mx-1">pnpm tauri:dev</code>.
      </div>
    );
  }

  return getCurrentWindow().label === 'copilot' ? <CopilotWindow /> : <MainShell />;
}
