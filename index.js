const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')






const port = process.env.PORT || 5000


const app = express()


//Middleware Start
const corsOptions = {
    origin: [ 'http://localhost:5173', 'http://localhost:5174' ],
    credentials: true,
    optionSuccessStatus: 200,
}



app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

// Verify JWT Middleware

const verifyToken = (req, res, next) =>{
  const token = req.cookies?.token;


  if(!token) return res.status(401).send({message: "Unauthorized Access"})

      if(token){
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
          if(err)
            {
              return res.status(401).send({message: "Unauthorized Access"})
            }
            
            req.user= decoded;
            next();
          } )
      }
    
    
}

//Middleware End


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.b9e8y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const jobsCollection = client.db('AAALance').collection('jobs')
    const bidsCollection = client.db('AAALance').collection('bids')





// JWT Start
app.post("/jwt", async(req, res)=>{
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,{
     expiresIn:"7d"
  } )

  res
  .cookie('token', token,{
    httpOnly: true,
    secure: process.env.NODE_ENV==='production',
    sameSite:  process.env.NODE_ENV==='production'? 'none' : 'strict',
  })
  .send({success:true})
})



app.get("/logout", (req, res)=>{
  res
  .clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV==='production',
    sameSite:  process.env.NODE_ENV==='production'? 'none' : 'strict',
    maxAge: 0
  })
  .send({success:true})
})
// JWT END










    app.get("/jobs", async(req, res)=>{
        const result = await jobsCollection.find().toArray();
        res.send(result)
    })



    app.get("/job/:id", async(req, res)=>{
        const id = req.params.id
        const result = await jobsCollection.findOne({_id : new ObjectId(id)});
        res.send(result)
    })

    app.get("/jobs/:email", verifyToken, async(req, res)=>{
      const tokenEmail = req.user.email
      const email = req.params.email;
      if(tokenEmail !== email){
        return res.status(403).send({message: "Forbidden Access"})
      }
      const result = await jobsCollection.find({'buyer.email' : email}).toArray();
      res.send(result)
    })

    app.get("/bids/:email",verifyToken, async(req, res)=>{
      const tokenEmail = req.user.email
      const email = req.params.email;
      if(tokenEmail !== email){
        return res.status(403).send({message: "Forbidden Access"})
      }
      const result = await bidsCollection.find({email : email}).toArray();
      res.send(result)
    })


    app.get("/bid-request/:email",verifyToken, async(req, res)=>{
      const tokenEmail = req.user.email
      const email = req.params.email;
      if(tokenEmail !== email){
        return res.status(403).send({message: "Forbidden Access"})
      }
      const result = await bidsCollection.find({'buyer.email' : email}).toArray();
      res.send(result)
    })


    app.post("/jobs", async(req, res)=>{
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob)
      res.send(result)
    })

    app.post("/bids", async(req, res)=>{
      const bidData = req.body

      // check if its a duplicate request
      const query = {
        email: bidData.email,
        jobId: bidData.jobId,
      }
      const alreadyApplied = await bidsCollection.findOne(query)
      console.log(alreadyApplied)
      if (alreadyApplied) {
        return res
          .status(400)
          .send('You have already placed a bid on this job.')
      }

      const result = await bidsCollection.insertOne(bidData)

      // update bid count in jobs collection
      const updateDoc = {
        $inc: { bid_count: 1 },
      }
      const jobQuery = { _id: new ObjectId(bidData.jobId) }
      const updateBidCount = await jobsCollection.updateOne(jobQuery, updateDoc)
      console.log(updateBidCount)
      res.send(result)
    })


    app.delete("/job/:id", async(req, res)=>{
      const id = req.params.id
      const result = await jobsCollection.deleteOne({_id : new ObjectId(id)});
      res.send(result)
  })



  app.put('/update/:id', async (req, res) => {
    const id = req.params.id
    const jobData = req.body
    const updated = {
      $set: jobData,
    }
    const query = { _id: new ObjectId(id) }
    const options = { upsert: true }
    const result = await jobsCollection.updateOne(query, updated, options)
    res.send(result)
  })




  app.patch('/update-status/:id', async (req, res) => {
    const id = req.params.id
    const status = req.body
    const query = { _id: new ObjectId(id) }
    const updated = {
      $set: status,
    }
    const result = await bidsCollection.updateOne(query, updated)
    res.send(result)
  })

 
  
// Get all jobs data from db for pagination
app.get('/all-jobs', async (req, res) => {
  const size = parseInt(req.query.size)
  const page = parseInt(req.query.page) - 1
  const filter = req.query.filter
  const sort = req.query.sort
  const search = req.query.search
  console.log(size, page)

  let query = {
    job_title: { $regex: search, $options: 'i' },
  }
  if (filter) query.category = filter
  let options = {}
  if (sort) options = { sort: { deadline: sort === 'asc' ? 1 : -1 } }
  const result = await jobsCollection
    .find(query, options)
    .skip(page * size)
    .limit(size)
    .toArray()

  res.send(result)
})

// Get all jobs data count from db
app.get('/jobs-count', async (req, res) => {
  const filter = req.query.filter
  const search = req.query.search
  let query = {
    job_title: { $regex: search, $options: 'i' },
  }
  if (filter) query.category = filter
  const count = await jobsCollection.countDocuments(query)

  res.send({ count })
})















    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
























app.get("/", (req, res)=>{
    res.send("Hello from AAALance Server")
})

app.listen(port, ()=>console.log(`Server is listening on port ${port}`))


