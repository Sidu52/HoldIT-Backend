import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
});

// Events
redis.on("connect", () => console.log("🔌 Redis connected"));
redis.on("ready", () => console.log("Redis ready"));
redis.on("error", (err) => console.log("Redis Error:", err));
redis.on("reconnecting", () => console.log("Redis reconnecting"));

// Test read/write
await redis.set("foo", "bar");
await redis.get("foo");

export default redis;


// Set key with expiration time
export const set = (key, value, type ,expiration) => {
  return new Promise((resolve, reject) => {
    redis.set(key, value, type, expiration, (err, reply) => {
      if (err) reject(err);
      resolve(reply);
    });
  });
};

// Get key
export const get = (key) => {
  return new Promise((resolve, reject) => {
    redis.get(key, (err, reply) => {
      if (err) reject(err);
      resolve(reply);
    });
  });
};

// Delete key
export const del = (key) => {
  return new Promise((resolve, reject) => {
    redis.del(key, (err, reply) => {
      if (err) reject(err);
      resolve(reply);
    });
  });
};

// Exist key
export const exists = (key) => {
  return new Promise((resolve, reject) => {
    redis.exists(key, (err, reply) => {
      if (err) reject(err);
      resolve(reply);
    });
  });
};

// Delete all keys
export const flushall = () => {
  return new Promise((resolve, reject) => {
    redis.flushall((err, reply) => {
      if (err) reject(err);
      resolve(reply);
    });
  });
};

// ttl
export const ttl = (key) => {
  return new Promise((resolve, reject) => {
    redis.ttl(key, (err, reply) => {
      if (err) reject(err);
      resolve(reply);
    });
  });
};

