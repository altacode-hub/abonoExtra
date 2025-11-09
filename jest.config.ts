import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '\\.(css|less|scss)$': '<rootDir>/test/styleMock.js',
  },
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
};

export default config;