CREATE TABLE users (
	id serial PRIMARY KEY,
	email VARCHAR ( 255 ) UNIQUE NOT NULL,
	password VARCHAR ( 255 ) NOT NULL,
	failed_login_attempts INTEGER DEFAULT 0,
	max_failed_login_attempts_at NUMERIC -- js timestamp
);

CREATE TABLE tags (
	id serial PRIMARY KEY,
	name VARCHAR ( 255 ) UNIQUE NOT NULL,
	color VARCHAR ( 255 ) NOT NULL
);
INSERT INTO tags (name, color) VALUES ('Blocked', '#cc3333');

CREATE TABLE lines (
	id serial PRIMARY KEY,
	content TEXT,
	tag_id INTEGER,
	next_id INTEGER,
	child_id INTEGER,
	CONSTRAINT fk_tag
      FOREIGN KEY(tag_id) 
	  REFERENCES tags(id),
	CONSTRAINT fk_next
      FOREIGN KEY(next_id) 
	  REFERENCES lines(id),
	CONSTRAINT fk_child
      FOREIGN KEY(child_id) 
	  REFERENCES lines(id)
);

-- test data
INSERT INTO lines (content) VALUES ('test');
INSERT INTO lines (content, child_id) VALUES ('parent', 1);
INSERT INTO lines (content, next_id) VALUES ('before next', 1);