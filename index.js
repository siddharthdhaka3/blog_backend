const express = require('express');
const cors = require('cors');
const mongoose = require("mongoose");
const User = require('./models/User');
const Post = require('./models/Post');
const bcrypt = require('bcryptjs');
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const storage = multer.memoryStorage()
const uploadMiddleware = multer()

require('dotenv').config();

const fs = require('fs');
const { log } = require('console');

const cloudinary = require('cloudinary').v2;
          
cloudinary.config({ 
  cloud_name: process.env.CLOUD_NAME, 
  api_key: process.env.API_KEY, 
  api_secret: process.env.API_SECRET
});

const salt = bcrypt.genSaltSync(10);
const secret = process.env.HASH_SECRET;

app.use(cors({credentials:true,origin:`${process.env.REQ_URL }`}));

app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  res.cookie('cookieName', 'cookieValue', {
    sameSite: 'none',
    secure: true,
  });
  next();
});
//app.use('/uploads', express.static(__dirname + '/uploads'));
const session = require('express-session');

const sessionConfig = {
  secret: 'MYSECRET',
  name: 'appName',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie : {
    sameSite: 'none', 
  }
};

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // trust first proxy
  sessionConfig.cookie.secure = true; // serve secure cookies
}
mongoose.connect(process.env.DATABASE);

app.post('/register', async (req,res) => {
  const {username,password} = req.body;
  try{
    const userDoc = await User.create({
      username,
      password:bcrypt.hashSync(password,salt),
    });
    res.json(userDoc);
  } catch(e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post('/login', async (req,res) => {
  const {username,password} = req.body;
  const userDoc = await User.findOne({username});
  const passOk = bcrypt.compareSync(password, userDoc.password);
  if (passOk) {
    // logged in
    jwt.sign({username,id:userDoc._id}, secret, {}, (err,token) => {
      if (err) throw err;
      res.cookie('token', token).json({
        id:userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json('wrong credentials');
  }
});

app.get('/profile', (req,res) => {
  const {token} = req.cookies;
  jwt.verify(token, secret, {}, (err,info) => {
    if (err) throw err;
    res.json(info);
  });
});


app.post('/logout', (req,res) => {
  res.cookie('token', '').json('ok');
});

app.post('/post', uploadMiddleware.single('file'), async (req,res) => {
  // console.log(req.file);
  //console.log(req.file);
  // const dataUri = req => dUri.format(path.extname(req.file.originalname).toString(), req.file.buffer);
  // console.log(dataUri);
  //const fileString = req.file.buffer.toString();
  const base64Data = req.file.buffer.toString('base64');
  const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
  // Now you can use the fileString as needed
  //console.log(fileString);
  
  const result = await cloudinary.uploader.upload(dataUri);

  // const {originalname,path} = req.file;
  // const parts = originalname.split('.');
  // const ext = parts[parts.length - 1];
  // const newPath = path+'.'+ext;
  // fs.renameSync(path, newPath);

  const {token} = req.cookies;
  jwt.verify(token, secret, {}, async (err,info) => {
    if (err) throw err;
    const {title,summary,content} = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover:result.secure_url,
      author:info.id,
    });
    res.json(postDoc);
  });

});



app.put('/post',uploadMiddleware.single('file'), async (req,res) => {
  let newPath = null;
  
  if (req.file) {
    const base64Data = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
    const result = await cloudinary.uploader.upload(dataUri);
    newPath = result.secure_url;
    // const {originalname,path} = req.file;
    // const parts = originalname.split('.');
    // const ext = parts[parts.length - 1];
    // newPath = path+'.'+ext;
    // fs.renameSync(path, newPath);
  }

  const {token} = req.cookies;
  jwt.verify(token, secret, {}, async (err,info) => {
    if (err) throw err;
    const {id,title,summary,content} = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json('you are not the author');
    }
    await postDoc.update({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  });

});

app.get('/post', async (req,res) => {
  res.json(
    await Post.find()
      .populate('author', ['username'])
      .sort({createdAt: -1})
      .limit(20)
  );
});

app.get('/post/:id', async (req, res) => {
  const {id} = req.params;
  const postDoc = await Post.findById(id).populate('author', ['username']);
  res.json(postDoc);
})

app.listen(process.env.PORT);
//
