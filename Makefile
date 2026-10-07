# Entry points the interns coder/reviewer pipeline runs before opening or
# updating a PR.

.PHONY: setup test build

setup:
	npm ci

test:
	npm test

build:
	npm run build
