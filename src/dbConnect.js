import pg from 'pg';

const { POSTGRES_PASSWORD, POSTGRES_PORT, POSTGRES_NAME, POSTGRES_HOST, POSTGRES_USER } = process.env;

const pool = new pg.Pool({
	host: POSTGRES_HOST,
	user: POSTGRES_USER,
	password: POSTGRES_PASSWORD,
	database: POSTGRES_NAME,
	port: POSTGRES_PORT,
});

export default pool;
