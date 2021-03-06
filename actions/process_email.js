import MP from 'mailparser'
import sanitizeHtml from 'sanitize-html'
import shortid from 'shortid'
import imgur from '/imgur/imgur'
import cheerio from 'cheerio'
import { detectWhitelist, detectLanguage, langCode3to2 } from '/actions/localise'
import { slugify } from '/actions/title-to-slug'
import { config } from '/config/environment'

const sanitizeOptions = {
  // allowedTags: [ 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
  // 'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
  // 'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'img' ],
  allowedTags: [ 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
  'nl', 'li', 'b', 'i', 'u', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
  'thead', 'caption', 'img', 'dir', 'marquee', 'font', 'table', 'tbody', 'tr', 'td', 'th', 'col', 'colgroup' ],
  allowedAttributes: {
    table: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    tbody: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    tr: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    td: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    th: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    col: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    colgroup: ['cellspacing', 'cellpadding', 'border', 'width', 'height', 'dir', 'align', 'size', 'color', 'face'],
    a: [ 'href', 'name', 'target', 'rel' ],
    // We don't currently allow img itself by default, but this
    // would make sense if we did
    img: [ 'src', 'width' ],
    p: [ 'dir', 'size', 'color', 'face'],
    div: ['dir', 'size', 'color', 'face'],
    font: ['size', 'color', 'face']
  },
  // Lots of these won't come up by default because we don't allow them
  selfClosing: [ 'img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta' ],
  // URL schemes we permit
  allowedSchemes: [ 'http', 'https', 'ftp', 'mailto' ],
  allowedSchemesByTag: {
    img: ['data', 'http', 'https']
  },
  allowProtocolRelative: true,
  transformTags: {
    'a': function(tagName, attribs){ //if youtube
      var newAttribs = attribs;
      newAttribs.rel = 'nofollow'
      newAttribs.target = '_blank'
      var tag = { tagName: tagName, attribs: newAttribs }
      return tag
    }
  }
}

const parseMail = raw => new Promise((resolve, reject) => {
  const mailparser = new MP.MailParser()
  mailparser.on('end', mail => resolve(mail))
  mailparser.on('error', err => reject(err))
  mailparser.write(raw);
  mailparser.end();
})

const uploadImage = image => {
  const imgBase64 = image.content.toString('base64')
  return imgur.upload(imgBase64)
    .then(response => ({
      contentId: image.contentId,
      imgURL: response.data.link
    }))
}

const processImages = email => {
  const attachments = email.attachments || []
  return Promise.all(
    attachments
      .filter(a => a.contentType.includes('image'))
      .map(uploadImage)
  ).then(images => {
    images.forEach(image => {
      const cid = `cid:${image.contentId}`
      if(email.html.indexOf(cid) >= 0){
        const match = new RegExp(cid, 'g')
        email.html = email.html.replace(match, image.imgURL)
      }else{
        email.html += `<img src="${image.imgURL}"/>`
      }
    })
  }).then(() => email)
}

const sanitize = email => {
  email.html = sanitizeHtml(email.html, sanitizeOptions).replace(/<p> <\/p>/g,'')
  email.subject = sanitizeHtml(email.subject, { allowedTags: [ 'marquee' ] })
  return email
}

// Convert plain text emails to html
// remove line break overkill
// Replace undefined subject/body with empty strings.
const tidyEmail = email => {
  // convert plain text emails to basic html
  if(!email.html && email.text){
    email.html = '<p>' + email.text.replace(/[\n]+/g,'</p><p>') + '</p>'
  }

  // replace undefined subject and body with empty strings
  if(!email.subject){ email.subject = ' ' }

  return email
}

const tidyAPIEmail = email => new Promise((resolve, reject) => {
  if(!email.html && email.text){
    email.html = '<p>' + email.text.replace(/[\n]+/g,'</p><p>') + '</p>'
  }
  // replace undefined subject and body with empty strings
  if(!email.subject){ email.subject = ' ' }

  resolve(email)
})

// detect email content language and set a language code on the email object
const setLanguage = email => {
  email.language = detectLanguage(email)
  return email
}

// generate slug
const generateSlug = email => {
  var slug = slugify(email.subject)
  // console.log(slug)
  email.slug = slug
  // console.log(email)
  return email
}

// strip common signatures from email HTML
const stripSignatures = email => {
  // text only emails
  if(!email.html && email.text){
    // default iPhone signature
    email.text.replace(/\n\nSent\sfrom\smy\siPhone/, '')
  }else{
    // load html to cheerio
    var $ = cheerio.load(email.html)
    // default iPhone signature
    email.text.replace('<br><br>Sent from my iPhone','')

    // Gmail
    $('.gmail_signature').remove()

    // Gmail backup
    $('[data-smartmail=gmail_signature]').remove()

    email.html = $.html()
  }
  // console.log(email.html)
  return email
}

// Convert YouTube links into embeds
const filterLinks = email => {
  // find links
  var links = email.html.match(/<a.+?(<\/a>)/g)
  if (links){
    links = links.map(link => {

      if(link.match(/>(.+?)(?=<\/a>)/) && link.match(/>(.+?)(?=<\/a>)/)[1]){
        var link_text = link.match(/>(.+?)(?=<\/a>)/)[1]
      }else{ var link_text = null }

      if(link.match(/href\="(.+?)(?=")/) && link.match(/href\="(.+?)(?=")/)[1]){
        var link_href = link.match(/href\="(.+?)(?=")/)[1]
      }else{ var link_href = null }

      var isYouTube = /https?:\/\/(?:www\.)?youtu(?:be)?(\.com|\.be)\/(?:watch\?v=)?[a-zA-Z0-9-_]{11}/.test(link_href)

      // emails may contain links links to YouTube domains that aren't videos?
      if(link_href && link_href.match(/[a-zA-Z0-9-_]{11}/)){
          var YouTubeID = link_href.match(/[a-zA-Z0-9-_]{11}/)[0]
      }else{
        var YouTubeID = false
      }

      var processed_link = {
        raw: link,
        text: link_text,
        href: link_href,
        isYouTube: isYouTube,
        YouTubeID: YouTubeID
      }

      return processed_link
    })

    links.forEach(link => {
      // if the link text matches the href
      if(link.isYouTube && link.YouTubeID && link.text == link.href){
        var embedCode = '<div class="youtube-wrapper"><iframe class="youtube-embed" src="https://www.youtube.com/embed/' + link.YouTubeID + '" frameborder="0" allowfullscreen></iframe></div>'
        email.html = email.html.replace(link.raw, embedCode)
      }
    })
  }

  return email
}

const buildEmailObj = rawEmail => {
  const messageId = rawEmail.messageId

  var to = ['list@' + config.DOMAIN ]
  if(rawEmail.to){
    to = rawEmail.to
  }else if(rawEmail.label){
    to = [{ address: 'list+' + rawEmail.label + '@' + config.DOMAIN}]
  }

  const from = rawEmail.from
  const cc = rawEmail.cc
  const bcc = rawEmail.bcc
  const subject = rawEmail.subject
  const html = rawEmail.html
  const date = rawEmail.date
  const language = rawEmail.language
  const slug = rawEmail.slug

  // join to, cc, bcc
  // match for staging/page/email and label
  var recipients = to
  if(cc){ recipients = recipients.concat(cc)}
  if(bcc){ recipients = recipients.concat(bcc)}
  var labelMatch = recipients.map(r => {
    return r.address
  })
  .join(',')
  .match(/(page|email|list)(?:\+)([\w]+)(?:@(?:dev.)?listarmy.com)/)

  shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ~_')

  const output = {
    to,
    from,
    subject,
    html,
    messageId: shortid.generate(),
    // headerMessageId: messageId,
    timeAdded: new Date().getTime(),
    language,
    editKey: shortid.generate() + shortid.generate(),
    slug,
  }
  if(cc) { output.cc = cc }
  if(bcc) { output.bcc = bcc }
  if(labelMatch) { output.label = labelMatch[2]}
  if(rawEmail.label){ output.label = rawEmail.label}
  if(rawEmail.list && rawEmail.list.listId){
    output.listId = rawEmail.list.listId
  }

  console.log('output')
  console.log(output)

  return output
}

const processAPIEmail = email => {
  console.log('processing')
  return tidyAPIEmail(email)
  .then(setLanguage)
  .then(generateSlug)
  .then(buildEmailObj)
  // console.log(email)
}

const processEmail = rawEmail => {
  return parseMail(rawEmail)
  .then(stripSignatures)
  .then(tidyEmail)
  .then(setLanguage)
  .then(generateSlug)
  .then(processImages)
  .then(sanitize)
  .then(filterLinks)
  .then(buildEmailObj)
}

const processListEmail = rawEmail => {
  return parseMail(rawEmail)
  .then(stripSignatures)
  .then(tidyEmail)
  .then(setLanguage)
  .then(generateSlug)
  .then(processImages)
  .then(sanitize)
  .then(buildEmailObj)
}

// any modifications before rendering to templates
const preRender = mailObj => {
  //check for arabic text
  var arabic = /[\u0600-\u06FF]/.test(mailObj.html)
  arabic ? mailObj.dir = "rtl" : mailObj.dir = "ltr"

  return mailObj
}

const addTimeSince = items => {
  var now = new Date()

  if(items.length){
    items.forEach(function(item, index, arr){
      var since = (now - arr[index].timeAdded)
      if(since < (1000*60*60)){ arr[index].timeSince = 'Just now'} // Less than 1 hour
      if(since >= (1000*60*60) && since < (1000*60*60*2)){ arr[index].timeSince = '1 hour ago' } // 1 hour
      if(since >= (1000*60*60*2) && since < (1000*60*60*24)){ arr[index].timeSince = Math.round(since/(1000*60*60)) + ' hours ago' } // 2-24 hours
      if(since >= (1000*60*60*24) && since < (1000*60*60*36)){ arr[index].timeSince = '1 day ago' } // 1-7 days
      if(since >= (1000*60*60*36) && since < (1000*60*60*24*14)){ arr[index].timeSince = Math.round(since/(1000*60*60*24)) + ' days ago' } // 2-7 days
      if(since >= (1000*60*60*24*14) && since < (1000*60*60*24*30)){ arr[index].timeSince = Math.round(since/(1000*60*60*24*7)) + ' weeks ago' } // 2-4 weeks
      if(since >= (1000*60*60*24*30) && since < (1000*60*60*24*46)){ arr[index].timeSince = '1 month ago' } // 1 month
      if(since >= (1000*60*60*24*46) && since < (1000*60*60*24*365)){ arr[index].timeSince = Math.round(since/(1000*60*60*24*30)) + ' months ago' } // 2-12 months
      if(since >= (1000*60*60*24*365) && since < (1000*60*60*24*548)){ arr[index].timeSince = '1 year ago' } // 1 year
      if(since >= (1000*60*60*24*548)){ arr[index].timeSince = Math.round(since/(1000*60*60*24*365)) + ' years ago' } // 2+ years
    })
  }
  return items

}

export {
  processEmail,
  processListEmail,
  preRender,
  addTimeSince,
  processAPIEmail
}
