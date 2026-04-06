export class Logger {
	private debugEnabled = false;

	setDebug(enabled: boolean): void {
		this.debugEnabled = enabled;
	}

	debug(...args: unknown[]): void {
		if (this.debugEnabled) console.debug('[ObsidianPublisher]', ...args);
	}

	info(...args: unknown[]): void {
		console.log('[ObsidianPublisher]', ...args);
	}

	warn(...args: unknown[]): void {
		console.warn('[ObsidianPublisher]', ...args);
	}

	error(...args: unknown[]): void {
		console.error('[ObsidianPublisher]', ...args);
	}
}

export const logger = new Logger();
