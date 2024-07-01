const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

//middleware
app.use(cors());
app.use(express.json());


//const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8v7eukl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const uri = 'mongodb://localhost:27017/';
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('restaurant is running');
})


async function run() {
    console.log("mongo is online")
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const userCollection = client.db('restaurantDb').collection('users');
        const menuCollection = client.db('restaurantDb').collection('menu');
        const reviewsCollection = client.db('restaurantDb').collection('reviews');
        const cartsCollection = client.db('restaurantDb').collection('carts');
        const paymentCollection = client.db('restaurantDb').collection('payments');
        

        //about JWT
        app.post('/jwt', async(req, res)=>{
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,{
                expiresIn: '1h'
            })
            res.send({token});
        })
        //verifytoken middleware
        const verifyToken = (req, res, next)=>{
            console.log('inside verify token',req.headers.authorization);
            if(!req.headers.authorization) return res.status(401).send({message: 'forbidden access'});
            const token = req.headers.authorization.split(' ')[1];
            if(!token){
                return res.status(401).send({message: 'forbidden access'});
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded)=>{
                if(error){
                    return res.status(401).send({message: 'forbidden access'})
                }
                req.decoded = decoded;
                next();
            })
            
        }

        //verify admin
        const verifyAdmin = async (req, res, next) =>{
            const email = req.decoded.email;
            const query = {email: email};
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role ==='admin';
            if(!isAdmin){
                return res.status(403).send({message: 'forbidden access'});
            }
            next();
        }


        //get ALlusers
        app.get('/users',verifyToken, verifyAdmin, async(req, res)=>{
            
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.post('/users', async(req, res)=>{
            const user = req.body;

            const query = {email: user.email}
            const existingUser = await userCollection.findOne(query);
            console.log(existingUser);
            if(existingUser){
                return res.send({message:"this user is exist"});
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        //deleteUser
        app.delete('/users/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await userCollection.deleteOne(query);
            res.send(result);

        });

        //make admin
        app.patch('/user/admin/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const updateDoc = {
                $set:{
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(query, updateDoc);
            res.send(result);

        })

        //check admin
        app.get('/user/admin/:email', verifyToken, async(req, res)=>{
            const email = req.params.email;
            if(email !== req.decoded.email){
                return res.status(403)._construct({message: 'unauthorized access'});
            }
            const query = {email: email};
            const user = await userCollection.findOne(query);
            let admin = false;
            if(user){
                admin = user.role === 'admin';
            }
            res.send({admin});
        })

        


        
        app.get('/menu', async(req, res)=>{
            const query = {};
            const result = await menuCollection.find(query).toArray();
            //console.log(result);
            res.send(result);
        })

        app.post('/menu', async(req, res)=>{
            const item = req.body;
            const result = await menuCollection.insertOne(item);
            res.send(result);
        })

        app.get('/menu/:id', async(req,res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await menuCollection.findOne(query);
            res.send(result);
        })

        app.patch('/menu/:id', async(req, res)=>{
            const id = req.params.id;
            const item = req.body;
            const  query = {_id: new ObjectId(id)};
            const updateDoc = {
                $set: {
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    recipe: item.recipe,
                    image: item.image

                }
            }
            const result = await menuCollection.updateOne(query, updateDoc);
            res.send(result);
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async(req, res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)}
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        } )


        app.get('/reviews', async(req, res)=>{
            const query = {};
            const result = await reviewsCollection.find(query).toArray();
            //console.log(result);
            res.send(result);
        })

        //adding to cart
        app.post('/carts', async(req, res)=>{
            const cartItem = req.body;
            const result = await cartsCollection.insertOne(cartItem);
            res.send(result);
        });

        //get
        app.get('/carts', async (req, res)=>{
            const email = req.query.email;
            const query = {email: email};
            const result = await cartsCollection.find(query).toArray();
            res.send(result);
        });

        //delete item
        app.delete('/carts/:id', async(req, res)=>{
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result  = await cartsCollection.deleteOne(query);
            res.send(result);

        })


        //payment intent
        app.post('/create-payment-intent', async(req, res)=>{
            const {price} = req.body;
            const amount = (parseInt(price)*100);
            console.log(amount);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']

            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.post('/payments', async(req, res)=>{
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            //console.log('payment info', payment);
            //carefully delete each item from the cart
            const query ={_id:{
                $in: payment.cartIds.map(id => new ObjectId(id))
            }};
            const deleteResult = await cartsCollection.deleteMany(query);
            
            res.send({paymentResult, deleteResult});
        });

        //get paymenthistory
        app.get('/payments/:email', verifyToken, async(req, res)=>{
            const query = {email: req.params.email}
            if(req.params.email !== req.decoded.email){
                return res.status(403).send({message: 'forbidden access'});
            }
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })

        //stats or anaytics
        app.get('/admin-stats',verifyToken, verifyAdmin, async(req, res)=>{
            const users = await userCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            //not the best way //geting total price
            // const payments = await paymentCollection.find().toArray();
            // const revenue = payments.reduce((total, payment) => total +payment.price,0);

            //best way to geting total price mongodb query
            const result = await paymentCollection.aggregate([
                {
                    $group:{
                        _id: null,
                        totalRevenue:{
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue,
            })
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
       // await client.close();
    }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log('restaurant is running on port:' + port)
})