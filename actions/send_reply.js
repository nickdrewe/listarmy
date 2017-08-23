import SES from '/aws/ses'
import doT from 'dot'
import {replyEmails} from '/templates/email-reply'
import { config } from '/config/environment'

const sendReply = mailObj => {

  //join addresses and test for staging
  var addresses = mailObj.to
  if(mailObj.cc){ addresses = addresses.concat(mailObj.cc)}
  if(mailObj.bcc){ addresses = addresses.concat(mailObj.bcc)}
  var emailStr = addresses.map(r => {
    return r.address
  })
  .join(',')
  
  var stagingTest = /dev\.listarmy\.com/

  mailObj.pteDomain = stagingTest.test(emailStr) ?
    'https://dev.listarmy.com' :
    'https://www.listarmy.com'

  // set reply template for the appropriate language
  var replyTemplate = doT.template(replyEmails[mailObj.language])
  var emailBody = replyTemplate(mailObj)

  const params = {
    Destination: {
      ToAddresses: [
        mailObj.from[0].address
      ],
      BccAddresses: [
        'publishthisemail@gmail.com'
      ]
    },
    Message: {
      Subject: {
        Data: mailObj.subject + ' - ' + config.DOMAIN,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: emailBody,
          Charset: 'UTF-8'
        }
      }
    },
    Source: '"Listarmy.com" <noreply@' + config.DOMAIN + '>',
    ReplyToAddresses: [
      '"Listarmy.com" <hello@' + config.DOMAIN + '>'
    ],
    ReturnPath: 'return@' + config.DOMAIN
  }

  return SES.sendEmail(params)
}

export {
  sendReply
}
