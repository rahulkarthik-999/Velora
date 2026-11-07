import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDragAnywhere, isInteractive } from './dragAnywhere';

function press(target: Element, x = 10, y = 10) {
  return { button: 0, defaultPrevented: false, target, clientX: x, clientY: y } as never;
}
const move = (x: number, y: number, buttons = 1) => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, buttons }));

describe('drag the copilot from anywhere', () => {
  it('starts a window drag after the pointer moves from a plain area', () => {
    const start = vi.fn();
    const div = document.createElement('div');
    makeDragAnywhere(start)(press(div));
    move(11, 11);
    expect(start).not.toHaveBeenCalled(); // under threshold: still a click
    move(30, 30);
    expect(start).toHaveBeenCalledTimes(1);
    move(60, 60);
    expect(start).toHaveBeenCalledTimes(1); // one drag per press, listeners removed
  });

  it('a click without movement never drags', () => {
    const start = vi.fn();
    makeDragAnywhere(start)(press(document.createElement('p')));
    window.dispatchEvent(new MouseEvent('mouseup'));
    move(50, 50);
    expect(start).not.toHaveBeenCalled();
  });

  it('never drags from buttons, inputs or other controls', () => {
    const start = vi.fn();
    const btn = document.createElement('button');
    const icon = document.createElement('svg');
    btn.appendChild(icon);
    for (const el of [btn, icon, document.createElement('input'), document.createElement('textarea'), document.createElement('select')]) {
      expect(isInteractive(el)).toBe(true);
      makeDragAnywhere(start)(press(el));
      move(80, 80);
    }
    expect(start).not.toHaveBeenCalled();
  });
});

describe('no hover instructions in the live copilot', () => {
  it('copilot components render no title tooltips', () => {
    for (const f of ['../components/overlay/CopilotWindow.tsx', '../components/overlay/QaFeed.tsx', '../components/session/CaptureIndicators.tsx', '../components/transcript/TranscriptView.tsx']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      // `title` is only allowed as the IconButton prop, which is rendered as aria-label.
      const raw = src.match(/<(?!IconButton)[a-z][^>]*\btitle=/g) ?? [];
      expect(raw, f).toEqual([]);
    }
    const cw = readFileSync(join(__dirname, '../components/overlay/CopilotWindow.tsx'), 'utf8');
    expect(cw).not.toMatch(/title=\{title\}/);
  });
});
