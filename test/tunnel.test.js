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
