// src/lib/dynamoClient.js
import {
  DynamoDBClient
} from "@aws-sdk/client-dynamodb";

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

const AWS_ENDPOINT = process.env.AWS_ENDPOINT || "http://localhost:4566";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// Base raw client
const rawClient = new DynamoDBClient({
  region: AWS_REGION,
  endpoint: AWS_ENDPOINT,
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
  maxAttempts: 2
});

// Document client (auto marshalling)
const docClient = DynamoDBDocumentClient.from(rawClient);

/**
 * -------------------------------------------------------
 * getItem(tableName, keyObj)
 * Returns item object or null
 * -------------------------------------------------------
 */
export async function getItem(tableName, key) {
  if (!tableName || !key)
    throw new Error("getItem: tableName and key are required");

  const resp = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: key
    })
  );

  return resp.Item || null;
}

/**
 * -------------------------------------------------------
 * putItem(tableName, itemObj)
 * Inserts record (no condition)
 * -------------------------------------------------------
 */
export async function putItem(tableName, item) {
  if (!tableName || !item)
    throw new Error("putItem: tableName and item are required");

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item
    })
  );

  return item;
}

/**
 * -------------------------------------------------------
 * updateItem(tableName, keyObj, updatesObj)
 * Returns ALL_NEW attributes
 * -------------------------------------------------------
 */
export async function updateItem(tableName, key, updates) {
  if (!tableName || !key || !updates)
    throw new Error("updateItem: tableName, key, updates are required");

  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  const parts = [];
  let idx = 0;

  for (const [field, value] of Object.entries(updates)) {
    idx++;
    const nameKey = `#k${idx}`;
    const valueKey = `:v${idx}`;
    ExpressionAttributeNames[nameKey] = field;
    ExpressionAttributeValues[valueKey] = value;
    parts.push(`${nameKey} = ${valueKey}`);
  }

  const UpdateExpression = `SET ${parts.join(", ")}`;

  const resp = await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ReturnValues: "ALL_NEW"
    })
  );

  return resp.Attributes || null;
}
