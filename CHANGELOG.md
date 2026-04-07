# Changelog

## [Unreleased]

## [1.1.3]
- "Qwen reads, Claude edits"
- Added `changeMode` parameter to ask-qwen tool for structured edit responses using claude edit diff.
- Testing intelligent parsing and chunking for large edit responses (>25k characters). I recommend you provide a focused prompt, although large (2000+) line edits have had success in testing.
- Added structured response format with Analysis, Suggested Changes, and Next Steps sections
- Improved guidance for applying edits using Claude's Edit/MultiEdit tools, avoids reading...
- Testing token limit handling with continuation support for large responses

## [1.1.2]
- Qwen Plus quota limit exceeded now falls back to qwen-turbo automatically. Unless you ask for plus or turbo, it will default to plus.

## [1.1.1]

- Public
- Basic Qwen CLI integration
- Support for file analysis with @ syntax
- Sandbox mode support
