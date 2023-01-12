import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { MongoClient } from "mongodb"
import dayjs from 'dayjs'
import { participantSchema, messageSchema } from '../schemas/schemas.js'

const PORT = 5000
const app = express()

dotenv.config()

app.use(cors())
app.use(express.json())
app.listen(PORT, () => {
    console.log(`Initialized server in port ${PORT}`)
})

const mongoClient = new MongoClient(process.env.DATABASE_URL)

let db;

mongoClient.connect().then(() => {
    db = mongoClient.db();
})

app.post("/participants", async (req, res) => {

    try {

        const participant = await participantSchema.validateAsync(req.body)

        const usernameInUse = await db.collection("participants").findOne(participant)

        if (usernameInUse) return res.sendStatus(409)

        await db.collection("participants").insertOne({ ...participant, lastStatus: Date.now() })

        await db.collection("messages").insertOne({
            from: participant.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs(Date.now()).format('HH:mm:ss')
        })

        return res.sendStatus(201)

    } catch (err) {
        console.log(err)

        if (err.isJoi) return res.sendStatus(422)

        return res.sendStatus(500)
    }
})

app.get("/participants", async (req, res) => {

    try {
        const participants = await db.collection("participants").find().toArray()

        return res.send(participants)
    } catch (err) {
        console.log(err)

        return res.sendStatus(500)
    }
})

app.post("/messages", async (req, res) => {

    try {

        const message = await messageSchema.validateAsync(req.body)

        const { user } = req.headers

        const userExists = await db.collection("participants").findOne({name: user})

        if(!userExists) return res.sendStatus(422)

        const messageWasPosted = await db.collection("messages").insertOne({
            from: user,
            ...message,
            time: dayjs(Date.now()).format('HH:mm:ss')
        })

        if(messageWasPosted) return res.sendStatus(201)

    } catch (err) {
        console.log(err)

        if(err.isJoi) return res.sendStatus(422)

        return res.sendStatus(500)
    }
})
