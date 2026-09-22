const { generateTunnelName, buildTunnelArguments } = require('./../commands/utils/tunnel');

describe('tunnel helpers', () => {
	test('generateTunnelName produces a unique-looking storybook tunnel name', () => {
		const name = generateTunnelName();
		expect(name).toMatch(/^smartui-storybook-tunnel-\d{7}$/);
		expect(generateTunnelName()).not.toBe(name);
	});

	test('buildTunnelArguments passes credentials and name, and only sets environment for stage', () => {
		expect(buildTunnelArguments({ user: 'u', key: 'k', env: 'prod', tunnelName: 't' }))
			.toEqual({ user: 'u', key: 'k', tunnelName: 't' });
		expect(buildTunnelArguments({ user: 'u', key: 'k', env: 'stage', tunnelName: 't' }))
			.toEqual({ user: 'u', key: 'k', tunnelName: 't', environment: 'stage' });
	});
});

describe('tunnel lifecycle', () => {
	const { startTunnel, stopTunnel } = require('./../commands/utils/tunnel');
	const silence = jest.spyOn(console, 'log').mockImplementation(() => {});
	afterAll(() => silence.mockRestore());

	function stubTunnel({ startResult = true, running = true, stopBehaviour = 'resolve' } = {}) {
		const proc = { kill: jest.fn() };
		return class Stub {
			constructor() { this.proc = proc; Stub.last = this; }
			start() { return startResult === 'never' ? new Promise(() => {}) : Promise.resolve(startResult); }
			isRunning() { return running; }
			stop() {
				if (stopBehaviour === 'never') return new Promise(() => {});
				if (stopBehaviour === 'reject') return Promise.reject(new Error('boom'));
				return Promise.resolve(true);
			}
		};
	}

	test('kills the spawned binary when start() resolves but the tunnel is not running', async () => {
		const Stub = stubTunnel({ startResult: false, running: false });
		await expect(startTunnel({ user: 'u', key: 'k', env: 'prod' }, Stub)).rejects.toThrow(/did not start/);
		expect(Stub.last.proc.kill).toHaveBeenCalledTimes(1);
	});

	test('stopTunnel does not hang on a stop() that never settles and kills the binary instead', async () => {
		jest.useFakeTimers();
		try {
			const Stub = stubTunnel({ stopBehaviour: 'never' });
			const handle = await startTunnel({ user: 'u', key: 'k', env: 'prod' }, Stub);
			const stopping = stopTunnel(handle);
			await jest.advanceTimersByTimeAsync(30000);
			await stopping;
			expect(Stub.last.proc.kill).toHaveBeenCalledTimes(1);
		} finally {
			jest.useRealTimers();
		}
	});

	test('stopTunnel falls back to killing the binary when stop() rejects', async () => {
		const Stub = stubTunnel({ stopBehaviour: 'reject' });
		const handle = await startTunnel({ user: 'u', key: 'k', env: 'prod' }, Stub);
		await stopTunnel(handle);
		expect(Stub.last.proc.kill).toHaveBeenCalledTimes(1);
	});
});
