import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: redisUrl,
});

export const pubClient = redisClient.duplicate();
export const subClient = redisClient.duplicate();

redisClient.on('error', (err) => console.error('Redis Client Error', err));
pubClient.on('error', (err) => console.error('Redis Pub Client Error', err));
subClient.on('error', (err) => console.error('Redis Sub Client Error', err));

export const connectRedis = async () => {
  await redisClient.connect();
  await pubClient.connect();
  await subClient.connect();
  console.log('Redis connected');
};
