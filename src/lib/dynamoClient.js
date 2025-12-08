// lib/dynamoClient.js
'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');

const AWS_ENDPOINT = process.env.AWS_ENDPOINT || 'http://localhost:4566';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const rawClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  maxAttempts: 2
});
const docClient = DynamoDBDocumentClient.from(rawClient);

/**
 * getItem(tableName, keyObj) -> returns item object or null
 */
async function getItem(tableName, key) {
  if (!tableName || !key) throw new Error('getItem: tableName and key are required');
  const resp = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  return resp.Item || null;
}

/**
 * putItem(tableName, itemObj) -> returns itemObj
 */
async function putItem(tableName, item) {
  if (!tableName || !item) throw new Error('putItem: tableName and item are required');
  await docClient.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

/**
 * updateItem(tableName, keyObj, updatesObj) -> returns updated attributes (ALL_NEW)
 */
async function updateItem(tableName, key, updates) {
  if (!tableName || !key || !updates) throw new Error('updateItem: tableName, key, updates are required');

  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  const parts = [];
  let idx = 0;

  for (const [k, v] of Object.entries(updates)) {
    idx++;
    const nameKey = `#k${idx}`;
    const valKey = `:v${idx}`;
    ExpressionAttributeNames[nameKey] = k;
    ExpressionAttributeValues[valKey] = v;
    parts.push(`${nameKey} = ${valKey}`);
  }

  const UpdateExpression = `SET ${parts.join(', ')}`;

  const cmd = new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const resp = await docClient.send(cmd);
  return resp.Attributes || null;
}

module.exports = { getItem, putItem, updateItem };
