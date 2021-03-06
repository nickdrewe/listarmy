import {
  getRawEmail,
  processEmail,
  processListEmail,
  processAPIEmail,
  storeInDynamo,
  sendReply,
  sendListPreview,
  collectionsProcess,
  isNotSubscribed,
  addSubscriber,
  sendSubscriberVerification,
  verifySubscriberId,
  unsubscribe,
  isNewList,
  addListToDB,
  sendNewListWelcome,
  sendNewListReply,
  sendListReply,
  sendListReplyNoSubs,
  addListIdToPage,
  getListSubscribers,
  getStoredEmail,
  listSend,
  markPostSent,
  getSubscriberFromSubscriberId,
  getListFromSubscriber,
  sendNewSubscriberNotification,
  sendListWelcomeAPI,
  getList,
  addBulkSubscribers,
  isNewListAPI,
  addListToDBAPI
} from './actions'
import { config } from '/config/environment'

// receive function for pages
const receive = (event, context, callback) => {
  const messageId = event.Records[0].s3.object.key
  getRawEmail(messageId, config.S3_BUCKET_PAGE)
  .then(processEmail)
  .then(collectionsProcess)
  .then(storeInDynamo)
  .then(sendReply)
  .then(result => {
    console.log('successful receive:', messageId, result)
    callback(null, { "disposition" : "STOP_RULE_SET" })
  })
  .catch(err => console.log(err.stack))
}

// create a new list via API
const listApiCreate = (event, context, callback) => {
  const list = {
    ownerEmail: event.queryStringParameters.oe.replace(/\s/g, '+'),
    listName: event.queryStringParameters.ln
  }
  // check for collectionName
  if(event.queryStringParameters.cn){
    list.collectionName = event.queryStringParameters.cn
  }
  // if no label use default label
  if(!list.collectionName){
    list.collectionName = 'defaultglobal'
  }

  isNewListAPI(list)
  .then(addListToDBAPI)
  .then(list => {
    // build dummy mailObj
    var mailObj = {
      from: [{ address: list.ownerEmail }],
      label: list.collectionName,
      subject: list.listName,
      html: ' ',
      list: list
    }
    return mailObj
  })
  .then(processAPIEmail)
  .then(collectionsProcess)
  .then(mailObj => {
    mailObj.subscriptionPage = true
    return mailObj
  })
  .then(storeInDynamo)
  .then(mailObj => {

    mailObj.list = list
    sendListWelcomeAPI(mailObj).catch(e => console.log(e))

    if(mailObj.label == 'defaultglobal'){
      var reply_label = false
    }else{
      var reply_label = mailObj.label
    }

    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: true, messageId: mailObj.messageId, label: reply_label }) }
    callback(null, response)
    // respond with link
  })
  .catch(e => {
    console.log(e)
    if(list.collectionName == 'defaultglobal'){
      // catch (user has default list)
      const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: false, label_required: true }) }
      callback(null, response)
    }else{
      // catch (duplicate label)
      const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: false, duplicate_label: true }) }
      callback(null, response)
    }
  })
}

// receive function for lists
const listReceive = (event, context, callback) => {
  const messageId = event.Records[0].s3.object.key

  getRawEmail(messageId, config.S3_BUCKET_LIST)
  .then(processListEmail)
  .then(collectionsProcess)
  .then(storeInDynamo)
  .then(mailObj => {
    mailObj.list = {
      ownerEmail: mailObj.from[0].address,
      collectionName: mailObj.label || 'defaultglobal'
    }
    return mailObj
  })
  .then(isNewList)
  .then(addListToDB) // add new list to DB
  .then(addListIdToPage) // add listId and sendKey to page
  .then(getListSubscribers)
  .then(mailObj => {
    if(!mailObj.newList && mailObj.subscribers.length > 0){
      listSend(mailObj)
      .then(markPostSent) // mark post as sent (to prevent duplicate sends)
      .then(sendListReply)
      .catch(e => { console.log(e) })
    }else if(mailObj.newList){
      sendNewListReply(mailObj) // send new list reply
    }else{
      sendListReplyNoSubs(mailObj) // send no subscribers reply
    }
  })
  .catch(e => { console.log(e) })
}


// subscription endpoint called directly from submission form returns { success: true/false, msg: 'error message' }
const listSubscribe = (event, context, callback) => {
  const subscriber = {
    subscriberEmail: event.queryStringParameters.subscriberEmail.replace(/\s/g, '+'),
    listId: event.queryStringParameters.listId,
  }
  isNotSubscribed(subscriber)
  .then(addSubscriber)
  .then(sendSubscriberVerification)
  .then(result => {
    console.log(result)
    // user subscribed & verification sent
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: true }) }
    callback(null, response)
  })
  .catch(e => {
    console.log(e)
    // user already subscribed
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: false, msg: 'That email address is already subscribed.'}) }
    callback(null, response)
  })
}

// buk subscription endpoint
const listBulkSubscribe = (event, context, callback) => {
  // { lid: '123',
  //   ek: '456',
  //   emailList: [ 'a@b.c', 'nick.drewe@gmail.com' ] }
  var params = JSON.parse(event.body)
  getList(params.lid)
  .then(list => {
    // if edit keys match
    if(list.editKey === params.ek ){
      var newSubscribers = params.emailList
      addBulkSubscribers(list, newSubscribers)
      .then(result => {
        // subscribers added
        const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: true }) }
        callback(null, response)
      })
      .catch(e => {
        // bulk add failed
        const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: false }) }
        callback(null, response)
      })

    }else{
      // keys don't match
      const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: false }) }
      callback(null, response)
    }
  })
  .catch(e => {
    // no list
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' }, body: JSON.stringify({ success: false }) }
    callback(null, response)
  })




}

// subscription endpoint called directly from submission form returns { success: true/false, msg: 'error message' }
const listUnsubscribe = (event, context, callback) => {
  const subscriberId = event.queryStringParameters.subscriberId

  unsubscribe(subscriberId)
  .then(result => {
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: true }) }
    callback(null, response)
  })
  .catch(e =>{
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: false, msg: e }) }
    callback(null, response)
  })
}

// Lambda endpoint to verify a subscriber (double opt-in)
// accepts /verify?subscriberId=_________
const verifySubscriber = (event, context, callback) => {
  if(event.queryStringParameters.subscriberId){
    const subscriberId = event.queryStringParameters.subscriberId

    verifySubscriberId(subscriberId)
    .then(result => {
      const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: true }) }
      callback(null, response)

      // New subscriber notification
      getSubscriberFromSubscriberId(subscriberId)
      .then(getListFromSubscriber)
      .then(sendNewSubscriberNotification)
      .then(result => {
        console.log('new subscriber notification sent')
      })
      .catch(e =>{
        console.log(e)
      })
    })
    .catch(e => {
      const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: false, msg: e }) }
      callback(null, response)
    })
  }else{
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: false, msg: 'no subscriberId provided' }) }
    callback(null, response)
  }
}

// endpoint for triggering a list delivery
// accepts a messageId and sendKey
const listDeliver = (event, context, callback) => {
  var clientSendKey = event.queryStringParameters.sk
  var messageId = event.queryStringParameters.mid

  // get message from emails table
  getStoredEmail(messageId)
  .then(mailPackage => {
    // confirm client sendKey matches email sendKey
    if(clientSendKey === mailPackage.sendKey && !mailPackage.delivered){
      // keys match, send away!
      return mailPackage
    }else if(mailPackage.delivered){
      return Promise.reject({ e: new Error('Already delivered'), msg: 'This page has already been delivered.'})
    }else{
      return Promise.reject({e: new Error('Invalid send link'), msg: 'Invalid send link'})
    }
  })
  .then(getListSubscribers) // get a list of verified subscribers
  .then(listSend) // send to subscribers
  .then(markPostSent) // mark post as send (to prevent duplicate sends)
  .then(mailPackage => {
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: true, subscriber_count: mailPackage.subscribers.length}) }
    callback(null, response)
  })
  .catch(e => {
    console.log(e.e, e.msg)
    const response = { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*',  'Access-Control-Allow-Credentials' : 'true' }, body: JSON.stringify({ success: false, msg: e.msg}) }
    callback(null, response)
  })
}

export {
  receive,
  listSubscribe,
  listBulkSubscribe,
  verifySubscriber,
  listUnsubscribe,
  listReceive,
  listDeliver,
  listApiCreate
}
