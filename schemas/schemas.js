import Joi from "@hapi/joi"

const participantSchema = Joi.object({
    name: Joi.string().min(1).required()
})

export default participantSchema