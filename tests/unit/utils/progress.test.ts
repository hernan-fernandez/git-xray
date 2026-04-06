import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startPhase, endPhase, updateProgress } from '../../../src/utils/progress.js';

describe('progress', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    // Clean up any active phase
    endPhase();
    stderrSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('startPhase', () => {
    it('should write the phase name to stderr', () => {
      startPhase('Analyzing contributions...');
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Analyzing contributions...'),
      );
    });

    it('should use carriage return for in-place update', () => {
      startPhase('Detecting hotspots...');
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^\r/);
    });
  });

  describe('endPhase', () => {
    it('should clear the progress line', () => {
      startPhase('Test phase');
      stderrSpy.mockClear();

      endPhase();
      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/^\r/);
    });

    it('should not write if no phase is active', () => {
      // endPhase called in afterEach already cleared state
      stderrSpy.mockClear();
      endPhase();
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateProgress', () => {
    it('should write the message to stderr', () => {
      updateProgress('Processing files...');
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('Processing files...'),
      );
    });

    it('should not show ETA when phase is under 10 seconds', () => {
      startPhase('Quick phase');
      stderrSpy.mockClear();

      updateProgress('Step 1', 0.5);
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('ETA');
    });

    it('should show ETA when phase exceeds 10 seconds and progress is provided', () => {
      // Mock Date.now to simulate elapsed time
      const realNow = Date.now;
      let fakeTime = realNow();
      vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

      startPhase('Slow phase');

      // Advance time by 15 seconds
      fakeTime += 15_000;

      stderrSpy.mockClear();
      updateProgress('Still working...', 0.5);
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).toContain('ETA');
      expect(output).toMatch(/~\d+s/);

      Date.now = realNow;
    });

    it('should not show ETA when progress is 0', () => {
      const realNow = Date.now;
      let fakeTime = realNow();
      vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

      startPhase('Phase');
      fakeTime += 15_000;

      stderrSpy.mockClear();
      updateProgress('Working...', 0);
      const output = stderrSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('ETA');

      Date.now = realNow;
    });
  });
});
