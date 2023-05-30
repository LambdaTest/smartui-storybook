const { ValidationError, validateConfigBrowsers, validateConfigResolutions } = require('./../commands/utils/validate');

describe('validate config', () => {
	describe('validate config browsers', () => {
		test('should throw a ValidationError for invalid browser', () => {
			expect(() => validateConfigBrowsers(['msedge'])).toThrow(ValidationError);
		});
		
		test('should throw a ValidationError for duplicate browsers', () => {
			expect(() => validateConfigBrowsers(['firefox', 'firefox'])).toThrow(ValidationError);
		});
	  
		test('should throw a ValidationError for empty browsers', () => {
			expect(() => validateConfigBrowsers([])).toThrow(ValidationError);
		});
	  
		test('should not throw a ValidateError for valid browsers', () => {
			expect(() => validateConfigBrowsers(['chrome', 'firefox', 'safari', 'edge'])).not.toThrow();
		});
	});

	describe('validate config resolutions', () => {
		test('should throw a ValidationError for empty resolutions', () => {
			expect(() => validateConfigResolutions([])).toThrow(ValidationError);
		});

		test('should throw a ValidationError for non-array resolutions', () => {
			expect(() => validateConfigResolutions('sdf')).toThrow(ValidationError);
		});

		test('should throw a ValidationError for exceeding limit for resolutions', () => {
			expect(() => validateConfigResolutions([[],[],[],[],[],[]])).toThrow(ValidationError);
		});

		test('should throw a ValidationError for exceeding limit for resolutions', () => {
			expect(() => validateConfigResolutions([[],[],[],[],[],[]])).toThrow(ValidationError);
		});

		test('should throw a ValidationError for invalid width', () => {
			expect(() => validateConfigResolutions([[1]])).toThrow(ValidationError);
		});

		test('should return modified resolutions array for empty height', () => {
			expect(validateConfigResolutions([[1280], [1920]])).toEqual([[1280,0], [1920, 0]]);
		});

		test('should return resolutions array for valid resolutions', () => {
			expect(validateConfigResolutions([[1280, 720], [1920, 1080], [365]])).toEqual([[1280,720], [1920, 1080], [365, 0]]);
		});
	});
});