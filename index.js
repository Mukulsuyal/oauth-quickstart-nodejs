require('dotenv').config();
const express = require('express');
const request = require('request-promise-native');
const NodeCache = require('node-cache');
const session = require('express-session');
const bodyParser=require("body-parser");
const opn = require('open');

const app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

const PORT = 3000;

const refreshTokenStore = {};
const accessTokenCache = new NodeCache({ deleteOnExpire: true });

if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    throw new Error('Missing CLIENT_ID or CLIENT_SECRET environment variable.')
}

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Scopes for this app will default to `crm.objects.contacts.read`
// To request others, set the SCOPE environment variable instead
let SCOPES = ['crm.objects.contacts.read'];
if (process.env.SCOPE) {
    SCOPES = (process.env.SCOPE.split(/ |, ?|%20/)).join(' ');
}

// On successful install, users will be redirected to /oauth-callback
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;


// Use a session to keep track of client ID
app.use(session({
  secret: Math.random().toString(36).substring(2),
  resave: false,
  saveUninitialized: true
}));
 
//   Running the OAuth 2.0 Flow   //


// Step 1
// Build the authorization URL to redirect a user
// to when they choose to install the app
const authUrl =
'https://app.hubspot.com/oauth/authorize?client_id=ce77238e-de32-4451-901f-2cd81832f10c&redirect_uri=http://localhost:3000/oauth-callback&scope=crm.objects.contacts.read';
// Redirect the user from the installation page to
// the authorization URL
app.get('/install', (req, res) => {
  console.log('');
  console.log('=== Initiating OAuth 2.0 flow with HubSpot ===');
  console.log('');
  console.log("===> Step 1: Redirecting user to your app's OAuth URL");
  res.redirect(authUrl);
  console.log('===> Step 2: User is being prompted for consent by HubSpot');
});

// Step 2
// The user is prompted to give the app access to the requested
// resources. This is all done by HubSpot, so no work is necessary
// on the app's end

// Step 3
// Receive the authorization code from the OAuth 2.0 Server,
// and process it based on the query parameters that are passed
app.get('/oauth-callback', async (req, res) => {
  console.log('===> Step 3: Handling the request sent by the server');

  // Received a user authorization code, so now combine that with the other
  // required values and exchange both for an access token and a refresh token
  if (req.query.code) {
    console.log('       > Received an authorization token');

    const authCodeProof = {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: req.query.code
    };

    // Step 4
    // Exchange the authorization code for an access token and refresh token
    console.log('===> Step 4: Exchanging authorization code for an access token and refresh token');
    const token = await exchangeForTokens(req.sessionID, authCodeProof);
    if (token.message) {
      return res.redirect(`/error?msg=${token.message}`);
    }

    // Once the tokens have been retrieved, use them to make a query
    // to the HubSpot API
    res.redirect(`/`);
  }
});


//  Exchanging Proof for an Access Token   //

const exchangeForTokens = async (userId, exchangeProof) => {
  try {
    const responseBody = await request.post('https://api.hubapi.com/oauth/v1/token', {
      form: exchangeProof
    });
    // Usually, this token data should be persisted in a database and associated with
    // a user identity.
    const tokens = JSON.parse(responseBody);
    refreshTokenStore[userId] = tokens.refresh_token;
    accessTokenCache.set(userId, tokens.access_token, Math.round(tokens.expires_in * 0.75));

    console.log('> Received an access token and refresh token');
    return tokens.access_token;
  } catch (e) {
    console.error(`       > Error exchanging ${exchangeProof.grant_type} for access token`);
    return JSON.parse(e.response.body);
  }
};

const refreshAccessToken = async (userId) => {
  const refreshTokenProof = {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshTokenStore[userId]
  };
  return await exchangeForTokens(userId, refreshTokenProof);
};

const getAccessToken = async (userId) => {
  // If the access token has expired, retrieve
  // a new one using the refresh token
  if (!accessTokenCache.get(userId)) {
    console.log('Refreshing expired access token');
    await refreshAccessToken(userId);
  }
  return accessTokenCache.get(userId);
};

const isAuthorized = (userId) => {
  return refreshTokenStore[userId] ? true : false;
};


//   Using an Access Token to Query the HubSpot API   //


const createContact=async(accessToken,data)=>{
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

    var options = { method: 'POST',
  url: 'https://api.hubapi.com/contacts/v1/contact/',
  headers :headers,
  body: 
   { properties: 
      [ { property: 'email', value: data.eMail },
        { property: 'firstname', value: data.firstName },
        { property: 'lastname', value: data.lastName }
         ] },
  json: true };

request(options, function (error, response, body) {
  if (error) throw new Error(error);

  console.log(body);
});
}

//----------------------------------UPDATE PART---------------------//
const updateContact=async(accessToken,data)=>{
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };

var options = { method: 'POST',
  url: 'https://api.hubapi.com/contacts/v1/contact/vid/11845824/profile',
  headers: headers,
  body: 
   { properties: 
      [ { property: 'email', value: data.eMail },
        { property: 'firstname', value:data.firstName },
        { property: 'lastname', value: data.lastName },
     ] },
  json: true };

request(options, function (error, response, body) {
  if (error) throw new Error(error);

  console.log(body);
});
}
//----------------

const getContact = async (accessToken) => {
  console.log('');
  console.log('Retrieving a contact from HubSpot using the access token');
  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    console.log('===> Replace the following request.get() to test other API calls');
     console.log('===> request.get(\'https://api.hubapi.com/contacts/v1/lists/all/contacts/all\')');
     const result = await request.get('https://api.hubapi.com/contacts/v1/lists/all/contacts/all', 
    
    {
      headers: headers
    });

    return JSON.parse(result).contacts;
  } catch (e) {
    console.error('  > Unable to retrieve contact');
    return JSON.parse(e.response.body);
  }
};



//Display the user informaton
const displayContactName = (res, contacts) => {
  if (contacts.status === 'error') {
    res.write(`<p>Unable to retrieve contact! Error Message: ${contact.message}</p>`);
    return;
  }

  console.log(contacts);

  contacts.map(printContacts =(contact)=>{
        const { firstname, lastname } = contact.properties;
        res.write(`<p>Contact name: ${firstname.value} ${lastname.value}</p>`);
  })
  
 
};

app.get('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.write(`<h2>My Hubspot App</h2>`);
  if (isAuthorized(req.sessionID)) {
    const accessToken = await getAccessToken(req.sessionID);
    const contact = await getContact(accessToken);
   res.write(`<h4>Access token: ${accessToken}</h4>`);
    displayContactName(res, contact);
    res.write(`<a href="/"><h3>List of Contacts</h3></a>`)
    res.write(`<a href="/createcontact"><h3>Create Contact</h3></a>`);
    res.write(`<a href="/updatecontact"><h3>Update Contact</h3></a>`)
  } else {
    res.write(`<a href="/install"><h3>Install the app</h3></a>`);
  }
  res.end();
});

app.get('/createcontact',async(req,res)=>{
  res.sendFile(__dirname+"/createcontact.html");
})

app.get('/updatecontact',async(req,res)=>{
  res.sendFile(__dirname+"/updatecontact.html");
})

app.post('/createcontact',async(req,res)=>{
  console.log(req.body);
  if (isAuthorized(req.sessionID)) {
    const accessToken = await getAccessToken(req.sessionID);
  createContact(accessToken,req.body);
} else {
  res.write(`<a href="/install"><h3>Install the app</h3></a>`);
}

  res.redirect('/createcontact');
})

app.post('/updatecontact',async(req,res)=>{
  console.log(req.body);
  if (isAuthorized(req.sessionID)) {
    const accessToken = await getAccessToken(req.sessionID);
  updateContact(accessToken,req.body);
} else {
  res.write(`<a href="/install"><h3>Install the app</h3></a>`);
}

  res.redirect('/updatecontact');
})



app.get('/error', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.write(`<h4>Error: ${req.query.msg}</h4>`);
  res.end();
});







app.listen(PORT, () => console.log(`App is Running on Server ${PORT} `));
opn(`http://localhost:${PORT}`);

