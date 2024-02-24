import express from 'express';
import pool from '../dbConnect.js';
import format from 'pg-format';
import pluralize from 'pluralize';

const router = express.Router();

// get all database table names
let tableNames = [];
await pool
	.query(
		`select table_schema||'.'||table_name as table_fullname
		from information_schema."tables"
		where table_type = 'BASE TABLE'
		and table_schema not in ('pg_catalog', 'information_schema');`
	)
	.then((data) => {
		tableNames = data.rows.map((e) => e.table_fullname.replace('public.', ''));
		// .filter((e) => e != 'users'); // TODO: remove users from here, insert users into where I am restricting user access rights to tables
	})
	.catch((e) => console.log(e));

// list foreign key relations for all table names
// one to many map
// {table_name, column_name, foreign_table_name, foreign_column_name}
let tableMap = [];
// https://soft-builder.com/how-to-list-all-foreign-keys-in-postgresql-database/
await pool
	.query(
		`SELECT conrelid::regclass AS table_name, 
				conname AS foreign_key, 
				pg_get_constraintdef(oid) 
		FROM   pg_constraint 
		WHERE  contype = 'f' 
		AND    connamespace = 'public'::regnamespace   
		ORDER  BY conrelid::regclass::text, contype DESC;`
	)
	.then((data) => {
		const { rows } = data;
		const newTableMap = [];

		for (const row of rows) {
			const temp = {};
			temp.table_name = row.table_name;
			const meta = row.pg_get_constraintdef;
			const newMeta = meta
				.replaceAll('FOREIGN KEY (', '')
				.replaceAll(') REFERENCES', '')
				.replaceAll('(', ' ')
				.replaceAll(')', '');
			const newMetaSplit = newMeta.split(' ');
			temp.column_name = newMetaSplit[0];
			temp.foreign_table_name = newMetaSplit[1];
			temp.foreign_column_name = newMetaSplit[2];
			newTableMap.push(temp);
		}

		tableMap = newTableMap;
	})
	.catch((e) => console.log(e));

const getList = async (tableName, query) => {
	let data,
		queryStr = '';

	const queryArr = Object.entries(query)[0];
	if (Object.entries(query).length == 0) {
		queryStr = format('SELECT * FROM %I;', tableName);
	} else {
		queryStr = format(
			'SELECT * FROM %I where %I=%L;',
			tableName,
			queryArr[0],
			queryArr[1]
		);
	}

	await pool.query(queryStr).then((_data) => {
		data = _data.rows;
	});

	return data;
};

const getNested = async (
	tableName,
	query,
	singleObject,
	previousTableNames,
	exclude,
	_data
) => {
	let data = _data ? _data : await getList(tableName, query);

	// get arrays
	for (const tableMeta of tableMap.filter(
		(tableMeta) => tableMeta.foreign_table_name == tableName
	)) {
		const { table_name, column_name, foreign_table_name, foreign_column_name } =
			tableMeta;

		// prevents cyclic calls
		if (table_name != [...previousTableNames].pop()) {
			for (let row of data) {
				row[table_name] = await getNested(
					table_name,
					{
						[column_name]: row[foreign_column_name],
					},
					false,
					[...previousTableNames, foreign_table_name]
				);
			}
		}
	}

	// get singleObject
	for (const tableMeta of tableMap.filter(
		(tableMeta) => tableMeta.table_name == tableName
	)) {
		const { table_name, column_name, foreign_table_name, foreign_column_name } =
			tableMeta;

		// prevents cyclic calls
		if (foreign_table_name != [...previousTableNames].pop()) {
			for (let row of data) {
				row[column_name.replace('_id', '')] = await getNested(
					foreign_table_name,
					{
						[foreign_column_name]: row[column_name],
					},
					true,
					[...previousTableNames, table_name]
				);
			}
		}
	}

	if (singleObject) data = data?.[0];

	return data;
};

tableNames.forEach((tableName) => {
	router.get(`/${pluralize.singular(tableName)}`, async (req, res) => {
		const { exclude, ...query } = req.query;
		const data = await getNested(tableName, query, true, [], exclude);

		res.json(data);
	});
	router.get(`/${tableName}`, async (req, res) => {
		const { exclude, ...query } = req.query;
		const data = await getNested(tableName, query, false, [], exclude);

		res.json(data);
	});
	router.post(`/${tableName}`, async (req, res) => {
		const { body } = req;
		let data = [];

		if (body.inserts && body.inserts.length !== 0) {
			const client = await pool.connect();
			try {
				await client.query('BEGIN;');

				// beginning of actual query
				for (const insert of body.inserts) {
					let columns = '';
					let values = '';

					Object.entries(insert).forEach(([field, value], i) => {
						if (i !== 0) {
							columns += ' , ';
							values += ' , ';
						}
						columns += `${field}`;
						// the null cannot be in single quotes
						if (value === null) {
							values += `${value}`;
						} else {
							values += `'${value}'`;
						}
					});
					await pool
						.query(
							format(
								`INSERT INTO %I (%s) VALUES (%s) RETURNING *;`,
								tableName,
								columns,
								values
							)
						)
						.then((_data) => {
							data = _data.rows;
						});
				}
				// end of actual query

				await client.query('COMMIT');
				data = await getNested(tableName, '', false, [], null, data);
				res.json(data); // specific success message
			} catch (e) {
				await client.query('ROLLBACK');
				console.log(e);
				res.status(400).json({ message: 'error' });
			} finally {
				client.release();
			}
		} else {
			res.status(500).json({ result: 'No inserts specified' });
		}
	});
	router.put(`/${tableName}`, async (req, res) => {
		const { body } = req;

		if (body.updates && body.updates.length !== 0) {
			const client = await pool.connect();
			try {
				await client.query('BEGIN;');

				// beginning of actual query
				for (const [id, id_updates] of Object.entries(body.updates)) {
					let set = '';

					Object.entries(id_updates).forEach(([field, value], i) => {
						if (i !== 0) {
							set += ' , ';
						}
						// the null cannot be in single quotes
						if (value === null) {
							set += `${field}=${value}`;
						} else {
							set += `${field}='${value}'`;
						}
					});

					await pool
						.query(format(`UPDATE %I SET %s WHERE id=%L;`, tableName, set, id))
						.then((_data) => {
							console.log(_data);
						});
				}
				// end of actual query

				await client.query('COMMIT');
				res.json({ message: 'success' }); // specific success message
			} catch (e) {
				await client.query('ROLLBACK');
				console.log(e);
				res.status(400).json({ message: 'error' });
			} finally {
				client.release();
			}
		} else {
			res.status(500).json({ result: 'No updates specified' });
		}
	});
	router.delete(`/${tableName}`, async (req, res) => {
		const { body } = req;
		if (body.ids && body.ids.length !== 0) {
			let filter = '';
			body.ids.forEach((id, i) => {
				if (i !== body.ids.length - 1) {
					filter += id + ',';
				} else {
					filter += id;
				}
			});

			await pool
				.query(format(`DELETE FROM %I where id in (%s);`, tableName, filter))
				.then((_data) => {
					console.log(_data);
				});

			res.json({ message: 'success' });
		} else {
			res.status(500).json({ result: 'No ids specified' });
		}
	});
});

export default router;
