class TrigItems:
    def __init__(self, trig_items_dict):
        trig_items_dict = {key.lower(): trig_items_dict[key] for key in trig_items_dict}
        self.channel = trig_items_dict['channel']
        self.level = trig_items_dict['level']
        self.edge = trig_items_dict['edge']
        self.coupling = trig_items_dict['coupling']
        self.holdoff = trig_items_dict['holdoff']