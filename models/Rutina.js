const mongoose=require('mongoose');
const ejercicio=new mongoose.Schema({nombre:String,series:Number,repeticiones:String,descanso:String,peso:String,indicaciones:String,imagen:String},{_id:true});
const schema=new mongoose.Schema({alumno:{type:mongoose.Schema.Types.ObjectId,ref:'Cliente',required:true,index:true},dia:{type:String,required:true},titulo:{type:String,required:true},ejercicios:[ejercicio],profesor:{type:String,default:''},actualizada:{type:Date,default:Date.now}}, {timestamps:true});
module.exports=mongoose.model('Rutina',schema);
