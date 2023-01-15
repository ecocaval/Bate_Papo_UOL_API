import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { MongoClient, ObjectId } from "mongodb"
import dayjs from 'dayjs'
import { participantSchema, messageSchema } from '../schemas/schemas.js'
import { stripHtml } from "string-strip-html"

const PORT = 5000
const app = express()
let db

dotenv.config()

app.use(cors())
app.use(express.json())
app.listen(PORT, () => {
    console.log(`Initialized server: port ${PORT}`)
})

checkInactiveUsers()

const mongoClient = new MongoClient(process.env.DATABASE_URL)

const dbWasConnected = await mongoClient.connect()

if (dbWasConnected) db = mongoClient.db()

app.get("/participants", async (req, res) => {

    try {
        const participants = await db.collection("participants").find().toArray()

        return res.send(participants)
    } catch (err) {
        console.log(err)

        return res.sendStatus(500)
    }
})

app.post("/participants", async (req, res) => {

    try {

        let participant = await participantSchema.validateAsync(req.body, {abortEarly: false})

        participant = sanitizeAndTrim(participant)

        const usernameInUse = await db.collection("participants").findOne(participant)

        if (usernameInUse) return res.sendStatus(409)

        await db.collection("participants").insertOne({ ...participant, lastStatus: Date.now() })

        let messageToInsert = {
            from: participant.name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs(Date.now()).format('HH:mm:ss')
        }

        messageToInsert = sanitizeAndTrim(messageToInsert)

        await db.collection("messages").insertOne(messageToInsert)

        return res.sendStatus(201)

    } catch (err) {
        console.log(err)

        if (err.isJoi) return res.sendStatus(422)

        return res.sendStatus(500)
    }
})

app.get("/messages", async (req, res) => {

    try {
        const { query } = req
        const { user } = req.headers

        const allMessages = await db.collection("messages").find({ $or: [{ from: user }, { to: user }, { to: "Todos" }] }).toArray()

        if (query.limit) {
            const messagesLimit = Number(query.limit)

            if (messagesLimit < 1 || isNaN(messagesLimit)) return res.sendStatus(422)

            return res.send([...allMessages].slice(-messagesLimit).reverse())
        }

        return res.send([...allMessages].reverse())

    } catch (err) {
        console.log(err)

        return res.sendStatus(500)
    }
})

app.post("/messages", async (req, res) => {

    try {

        const message = await messageSchema.validateAsync(req.body, {abortEarly: false})

        const { user } = req.headers

        const userExists = await db.collection("participants").findOne({ name: user })

        if (!userExists) return res.sendStatus(422)

        let messageToPost = {
            from: user,
            ...message,
            time: dayjs(Date.now()).format('HH:mm:ss')
        }

        messageToPost = sanitizeAndTrim(messageToPost)

        const messageWasPosted = await db.collection("messages").insertOne(messageToPost)

        if (messageWasPosted) return res.sendStatus(201)

    } catch (err) {
        console.log(err)

        if (err.isJoi) return res.sendStatus(422)

        return res.sendStatus(500)
    }
})

app.put("/messages/:id", async (req, res) => {

    try {
        const message = await messageSchema.validateAsync(req.body, {abortEarly: false})
        const requestUser = req.headers.user
        const { id } = req.params

        const messageInDb = await db.collection("messages").findOne({ _id: ObjectId(id) })

        if (!messageInDb) return res.sendStatus(404)

        if (requestUser !== messageInDb.from) return res.sendStatus(401)

        await db.collection("messages").updateOne({ _id: ObjectId(id) }, { $set: { ...message } })

        return res.sendStatus(200)

    } catch (err) {
        console.log(err);

        if (err.isJoi) return res.sendStatus(422)

        return res.sendStatus(500)
    }
})

app.delete("/messages/:id", async (req, res) => {
    const requestUser = req.headers.user
    const { id } = req.params

    try {
        const message = await db.collection("messages").findOne({ _id: ObjectId(id) })

        if (!message) return res.sendStatus(404)

        if (message.from !== requestUser) return res.sendStatus(401)

        await db.collection("messages").deleteOne({ _id: ObjectId(id) })

        return res.sendStatus(200)

    } catch (err) {

        console.log(err)

        return res.sendStatus(500)
    }
})

app.post("/status", async (req, res) => {

    try {

        const { user } = req.headers

        const userExists = await db.collection("participants").findOne({ name: user })

        if (!userExists) return res.sendStatus(404)

        await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } })

        return res.sendStatus(200)

    } catch (err) {
        console, log(err)

        return res.sendStatus(500)
    }
})

function checkInactiveUsers() {
    const timeTolerance = 10000 // * in milliseconds

    setInterval(async () => {

        const timeBottomLimit = Date.now() - timeTolerance

        try {
            const participants = await db.collection("participants").find().toArray()

            participants.forEach(async (participant) => {

                if (participant.lastStatus < timeBottomLimit) {

                    await db.collection("participants").deleteOne({ _id: ObjectId(participant._id) })

                    await db.collection("messages").insertOne({
                        from: participant.name,
                        to: 'Todos',
                        text: 'sai da sala...',
                        type: 'status',
                        time: dayjs(Date.now()).format('HH:mm:ss')
                    })
                }
            })

        } catch (err) {
            console.log(err)
        }

    }, timeTolerance)
}

function sanitizeAndTrim(obj) {
    for (const [key, value] of Object.entries(obj)) {

        if (typeof value === "string") {
        
            obj[key] = stripHtml(value).result.trim()
        
            continue
        }
        
        obj[key] = value
    }
    return obj;
}
