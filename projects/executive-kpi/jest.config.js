module.exports = {
    preset: "ts-jest", testEnvironment: "jsdom", roots: ["<rootDir>/src", "<rootDir>/tests"], testMatch: ["**/tests/**/*.test.ts"],
    setupFilesAfterEnv: ["<rootDir>/tests/jest.setup.ts"], moduleFileExtensions: ["ts", "js", "json"],
    // powerbi-visuals-utils-formattingmodel ships ES modules; compile it for Jest.
    transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
        "^.+\\.js$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }]
    },
    transformIgnorePatterns: ["node_modules/(?!powerbi-visuals-utils-formattingmodel)"],
    moduleNameMapper: { "\\.(less|css)$": "<rootDir>/tests/mocks/styleMock.js" }, clearMocks: true
};
