const mongoose=require('mongoose');
const schema=new mongoose.Schema({_id:{type:String,default:'principal'},nombre:{type:String,default:'JP Entrenamiento'},direccion:{type:String,default:''},telefono:{type:String,default:''},horarios:{type:String,default:'Lunes a viernes: consultar en recepción'},diasCerrados:{type:String,default:'Domingos'},duracionCuota:{type:Number,default:31,min:1,max:365}});
module.exports=mongoose.model('ConfiguracionGym',schema);
