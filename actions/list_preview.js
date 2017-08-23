import SES from '/aws/ses'
import doT from 'dot'
import {replyEmails} from '/templates/email-reply'
import { config } from '/config/environment'

const sendListPreview = mailObj => {

  mailObj.pteDomain = 'https://www.' + config.DOMAIN

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
        Data: mailObj.subject + ' - listarmy.com',
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
  sendListPreview
}
