import dynamo from '/aws/dynamo'
import SES from '/aws/ses'
import doT from 'dot'
import shortid from 'shortid'
import { config } from '/config/environment'

// Checks if a list exists in the DB, if not, builds and returns new list.
const isNewListAPI = list => {
  var query = {
    TableName: config.LISTS_TABLE,
    IndexName: 'ownerEmail-collectionName-index',
    KeyConditionExpression: "ownerEmail = :ownerEmail and collectionName = :collectionName",
    // FilterExpression: "collectionName = :collectionName",
    ExpressionAttributeValues: {
      ":ownerEmail": list.ownerEmail,
      ":collectionName": list.collectionName
    },
    Limit: 1 }

  return dynamo.query(query).then(result =>{
    console.log(result)
    if(result.Count == 0){
      // build new list
      list.listId = shortid.generate()
      list.editKey = shortid.generate() + shortid.generate()
      list.count_subscribers = 0
      list.count_unsubscribers = 0
      list.title = list.listName
      list.newList = true
    }else{
      return Promise.reject(new Error('List exists'))
    }
    return list
  })
}

const addListToDBAPI = list => {
  return dynamo.putResource({
    TableName: config.LISTS_TABLE,
    Item: list
  }).then(() => list)
}

export {
  isNewListAPI,
  addListToDBAPI
}
