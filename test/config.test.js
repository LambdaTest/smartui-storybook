const { ValidationError, validateConfigBrowsers } = require('./../commands/utils/validate');

describe('validate config', () => {
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