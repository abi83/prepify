# Entry points the interns coder/reviewer pipeline runs before opening or
# updating a PR.

.PHONY: setup test build

setup:
	npm ci
ifdef CI
	# Throwaway Postgres so the coder can run `prisma migrate dev`; prisma.config.ts reads .env.
	docker run -d --name migrate-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
	until docker exec migrate-db pg_isready -h localhost -U postgres; do sleep 1; done
	printf '%s\n' \
		'DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:5432/postgres' \
		'SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/shadow' > .env
	docker exec migrate-db createdb -U postgres shadow
endif

test:
	npm run db:generate
	npm run lint
	npm run typecheck
	npm test

build:
	npm run db:generate
	npm run build
