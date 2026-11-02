import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CaptureIndicators } from './CaptureIndicators';

afterEach(cleanup);

describe('CaptureIndicators', () => {
  it('shows each source with the status the native layer reported', () => {
    render(<CaptureIndicators capture={{ microphone: 'active', systemAudio: 'off', screen: 'unavailable' }} />);
    expect(screen.getByTestId('capture-microphone').dataset.status).toBe('active');
    expect(screen.getByText(/Microphone/).textContent).toContain('Recording');
    expect(screen.getByText(/System audio/).textContent).toContain('Off');
    expect(screen.getByText(/Screen/).textContent).toContain('Not available yet');
  });

  it('never says recording when nothing is active', () => {
    render(
      <CaptureIndicators capture={{ microphone: 'unavailable', systemAudio: 'unavailable', screen: 'unavailable' }} />
    );
    expect(screen.queryByText(/Recording/)).toBeNull();
  });

  it('keeps an accessible label in compact mode', () => {
    render(<CaptureIndicators compact capture={{ microphone: 'active', systemAudio: 'off', screen: 'off' }} />);
    expect(screen.getByText('Microphone: Recording')).toBeTruthy();
  });
});
