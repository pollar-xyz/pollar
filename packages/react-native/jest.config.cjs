module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/test/**/*.test.js'],
  moduleNameMapper: {
    '^react/package.json$': require.resolve('react/package.json'),
    '^react$': require.resolve('react'),
    '^react/jsx-runtime$': require.resolve('react/jsx-runtime'),
    '^react/jsx-dev-runtime$': require.resolve('react/jsx-dev-runtime'),
  },
  transformIgnorePatterns: ['node_modules/(?!((@)?react-native|@react-native)/)'],
};
